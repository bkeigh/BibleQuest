import { requireStripeBillingConfiguration } from "@/lib/billing/config.server";
import {
  claimStripeAction,
  customerForUser,
} from "@/lib/billing/records.server";
import { stripeBillingContractReady } from "@/lib/billing/server";
import { createStripe } from "@/lib/billing/stripe.server";
import { MAX_BILLING_REQUEST_BYTES } from "@/lib/billing/validation";
import { boundedJson } from "@/lib/http/json";
import { hasSameOrigin, privateError } from "@/lib/http/request";
import { arcadePriceId } from "@/lib/games/arcade/records.server";
import { arcadeStoreContractReady } from "@/lib/games/arcade/server";
import {
  arcadeProduct,
  isArcadeProductId,
} from "@/lib/games/arcade/store";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Creates one authenticated, server-priced arcade Checkout Session. */
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  const body = await boundedJson(request, MAX_BILLING_REQUEST_BYTES);
  if (body instanceof Response) return body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).join(",") !== "product" ||
    !isArcadeProductId((body as { product?: unknown }).product)
  ) {
    return privateError("invalid_request", 400);
  }

  try {
    const configuration = requireStripeBillingConfiguration();
    if (!configuration.arcadeEnabled || !configuration.arcadePriceIds) {
      return privateError("unavailable", 503);
    }
    const admin = createAdminSupabase();
    const [billingReady, arcadeReady] = await Promise.all([
      stripeBillingContractReady(context.supabase),
      arcadeStoreContractReady(context.supabase),
    ]);
    if (!billingReady || !arcadeReady) {
      return privateError("unavailable", 503);
    }
    const claim = await claimStripeAction(
      admin,
      context.user.id,
      "checkout",
      30,
    );
    if (!claim.claimed) {
      return Response.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": "30",
          },
        },
      );
    }

    const productId = (body as { product: "question-skip" | "game-pass" })
      .product;
    if (productId === "game-pass") {
      const { count, error } = await admin
        .from("arcade_orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.user.id)
        .eq("product_key", "game-pass")
        .in("outcome_status", [
          "completed",
          "partially_refunded",
          "dispute_won",
        ]);
      if (error) return privateError("unavailable", 503);
      if ((count ?? 0) > 0) return privateError("already_owned", 409);
    }

    const product = arcadeProduct(productId);
    const priceId = arcadePriceId(configuration, productId);
    if (!priceId) return privateError("unavailable", 503);
    const stripe = createStripe(configuration);
    const price = await stripe.prices.retrieve(priceId);
    if (
      !price.active ||
      price.type !== "one_time" ||
      price.recurring !== null ||
      price.currency !== "usd" ||
      price.unit_amount !== product.unitAmount ||
      !price.product
    ) {
      return privateError("unavailable", 503);
    }
    const customer = await customerForUser(
      admin,
      stripe,
      context.user,
      configuration,
    );
    const metadata = {
      purpose: "biblequest_arcade",
      biblequest_user_id: context.user.id,
      arcade_product: productId,
    };
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer,
        client_reference_id: context.user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${configuration.appOrigin}/app/games/store?checkout=returned`,
        cancel_url: `${configuration.appOrigin}/app/games/store?checkout=cancelled`,
        metadata,
        payment_intent_data: {
          description: `BibleQuest Arcade — ${product.title}`,
          metadata,
        },
      },
      {
        idempotencyKey: `biblequest-arcade-${context.user.id}-${productId}-${claim.claimToken}`,
      },
    );
    if (
      !session.url ||
      new URL(session.url).origin !== "https://checkout.stripe.com"
    ) {
      return privateError("unavailable", 503);
    }
    return Response.json(
      { url: session.url },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return privateError("unavailable", 503);
  }
}
