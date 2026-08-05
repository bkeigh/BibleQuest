import { guardProviderRequest } from "@/lib/bible/provider-request-guard";
import { guardDistributedRequest } from "@/lib/security/distributed-rate-limit.server";
import { requireStripeBillingConfiguration } from "@/lib/billing/config.server";
import { createStripe } from "@/lib/billing/stripe.server";
import { boundedJson } from "@/lib/http/json";
import { hasSameOrigin, privateError } from "@/lib/http/request";
import { isNativeAppOrigin } from "@/lib/http/native-origin";
import {
  isSupportAmount,
  MAX_SUPPORT_REQUEST_BYTES,
  SUPPORT_CURRENCY,
} from "@/lib/support/config";
import {
  claimSupportCheckout,
  completeSupportCheckout,
  supportCheckoutUrl,
} from "@/lib/support/records.server";
import {
  optionalSupportUser,
  stripeSupportContractReady,
} from "@/lib/support/server";
import {
  recordServerFailure,
  recordServerFailureReason,
} from "@/lib/observability/server-failures";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Best-effort failure projection must never expose a database exception. */
async function recordCreationFailure(
  admin: ReturnType<typeof createAdminSupabase>,
  values: {
    requestId: string;
    token: string;
    category: "provider" | "invalid";
  },
) {
  try {
    await completeSupportCheckout(admin, {
      requestId: values.requestId,
      token: values.token,
      outcome: "failed",
      errorCategory: values.category,
    });
  } catch (error) {
    // The caller still returns the same bounded unavailable response, but a
    // claim that cannot be released blocks the next attempt on this request.
    recordServerFailure("support", "complete", error);
  }
}

/** Creates one rate-limited, idempotent, server-priced support Checkout. */
export async function POST(request: Request) {
  // This route stays WEB-ONLY, deliberately.
  //
  // It is the only route where the origin check is the sole protection —
  // everywhere else `hasSameOrigin` is followed by an authenticated context.
  // Support checkout allows guests by design, so extending the native
  // allowance here would hand unauthenticated Stripe Checkout session creation
  // to any client that sets an Origin header, which carries no authentication
  // weight. Nothing is lost: `webCommerceAvailable()` already hides every
  // support-checkout entry point on native.
  if (isNativeAppOrigin(request)) return privateError("forbidden", 403);
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const blocked = guardProviderRequest(request, "support-checkout", [
    { limit: 5, windowMs: 10 * 60_000 },
    { limit: 20, windowMs: 24 * 60 * 60_000 },
  ]);
  if (blocked) return blocked;

  const body = await boundedJson(request, MAX_SUPPORT_REQUEST_BYTES);
  if (body instanceof Response) return body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).sort().join(",") !== "amount,requestId"
  ) {
    return privateError("invalid_request", 400);
  }
  const values = body as { amount?: unknown; requestId?: unknown };
  if (
    !isSupportAmount(values.amount) ||
    typeof values.requestId !== "string" ||
    !UUID.test(values.requestId)
  ) {
    return privateError("invalid_request", 400);
  }

  // Reserve shared capacity only after the request passes inexpensive validation.
  const distributedBlocked = await guardDistributedRequest(
    request,
    "support-checkout",
    [
      { limit: 5, windowSeconds: 10 * 60 },
      { limit: 20, windowSeconds: 24 * 60 * 60 },
    ],
  );
  if (distributedBlocked) return distributedBlocked;

  let admin;
  let configuration;
  let user;
  let claim;
  try {
    configuration = requireStripeBillingConfiguration();
    if (!configuration.supportEnabled) {
      return privateError("unavailable", 503);
    }
    admin = createAdminSupabase();
    if (!(await stripeSupportContractReady(admin))) {
      recordServerFailureReason("support", "claim", "schema");
      return privateError("unavailable", 503);
    }
    user = await optionalSupportUser(createServerSupabase);
    claim = await claimSupportCheckout(admin, {
      requestId: values.requestId,
      userId: user?.id ?? null,
      amount: values.amount,
      livemode: configuration.livemode,
    });
  } catch (error) {
    recordServerFailure("support", "claim", error);
    return privateError("unavailable", 503);
  }
  if (claim.status === "unavailable") {
    recordServerFailureReason("support", "claim", "conflict");
    return Response.json(
      { error: "retry_later" },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": "5",
        },
      },
    );
  }

  try {
    const stripe = createStripe(configuration);
    const session =
      claim.status === "created"
        ? await stripe.checkout.sessions.retrieve(claim.sessionId)
        : await stripe.checkout.sessions.create(
            {
              mode: "payment",
              customer_creation: "always",
              ...(user?.email && user.email_confirmed_at
                ? { customer_email: user.email }
                : {}),
              client_reference_id: values.requestId,
              line_items: [
                {
                  quantity: 1,
                  price_data: {
                    currency: SUPPORT_CURRENCY,
                    unit_amount: values.amount,
                    product_data: {
                      name: "Support BibleQuest — one time",
                      description:
                        "Voluntary, non-recurring, and not tax-deductible; no membership or spiritual benefit.",
                    },
                  },
                },
              ],
              success_url: `${configuration.appOrigin}/support?checkout=returned`,
              cancel_url: `${configuration.appOrigin}/support?checkout=cancelled`,
              metadata: {
                purpose: "biblequest_support",
                support_request_id: values.requestId,
              },
              payment_intent_data: {
                description: "One-time Support BibleQuest payment",
                metadata: {
                  purpose: "biblequest_support",
                  support_request_id: values.requestId,
                },
              },
            },
            {
              idempotencyKey: `biblequest-support-${values.requestId}`,
            },
          );
    const url = supportCheckoutUrl(session, {
      requestId: values.requestId,
      amount: values.amount,
      livemode: configuration.livemode,
    });
    if (!url) {
      recordServerFailureReason("support", "checkout", "invalid");
      if (claim.status === "claimed") {
        await recordCreationFailure(admin, {
          requestId: values.requestId,
          token: claim.token,
          category: "invalid",
        });
      }
      return privateError("unavailable", 503);
    }
    if (
      claim.status === "claimed" &&
      !(await completeSupportCheckout(admin, {
        requestId: values.requestId,
        token: claim.token,
        outcome: "created",
        sessionId: session.id,
      }))
    ) {
      recordServerFailureReason("support", "complete", "dependency");
      return privateError("unavailable", 503);
    }
    return Response.json(
      { url },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    recordServerFailure("support", "checkout", error);
    if (claim.status === "claimed") {
      await recordCreationFailure(admin, {
        requestId: values.requestId,
        token: claim.token,
        category: "provider",
      });
    }
    return privateError("unavailable", 503);
  }
}
