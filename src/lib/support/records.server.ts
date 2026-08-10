import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeObjectId } from "@/lib/billing/stripe-object.server";
import {
  isSupportAmount,
  SUPPORT_CURRENCY,
} from "./config";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKOUT_SESSION = /^cs_(test|live)_[A-Za-z0-9]+$/;
const TERMINAL_ADJUSTMENTS = new Set([
  "partially_refunded",
  "refunded",
  "disputed",
  "dispute_won",
  "dispute_lost",
]);
const DISPUTE_OUTCOMES = new Set([
  "disputed",
  "dispute_won",
  "dispute_lost",
]);

export class StripeSupportProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeSupportProjectionError";
  }
}

export interface StripeSupportPaymentRow {
  id: string;
  request_id: string;
  user_id: string | null;
  livemode: boolean;
  requested_amount: number;
  amount_total: number | null;
  amount_refunded: number;
  currency: string;
  checkout_status: string;
  payment_status: string;
  outcome_status: string;
}

interface StripeSupportLookupRow extends StripeSupportPaymentRow {
  stripe_payment_intent_id: string | null;
}

export type SupportCheckoutClaim =
  | { status: "claimed"; token: string }
  | { status: "created"; sessionId: string }
  | { status: "unavailable" };

function parseSupportClaim(value: unknown): SupportCheckoutClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "unavailable" };
  }
  const result = value as {
    claimed?: unknown;
    claim_token?: unknown;
    status?: unknown;
    session_id?: unknown;
  };
  if (
    result.claimed === true &&
    UUID.test(String(result.claim_token))
  ) {
    return { status: "claimed", token: String(result.claim_token) };
  }
  if (
    result.claimed === false &&
    result.status === "created" &&
    CHECKOUT_SESSION.test(String(result.session_id))
  ) {
    return { status: "created", sessionId: String(result.session_id) };
  }
  return { status: "unavailable" };
}

/** Claims one immutable guest or account-bound support Checkout request. */
export async function claimSupportCheckout(
  admin: SupabaseClient,
  values: {
    requestId: string;
    userId: string | null;
    amount: number;
    livemode: boolean;
  },
): Promise<SupportCheckoutClaim> {
  const { data, error } = await admin.rpc(
    "claim_stripe_support_checkout",
    {
      p_request_id: values.requestId,
      p_user_id: values.userId,
      p_amount: values.amount,
      p_currency: SUPPORT_CURRENCY,
      p_livemode: values.livemode,
    },
  );
  if (error) throw new Error("Stripe support claim unavailable.");
  return parseSupportClaim(data);
}

/** Completes the active creation token without exposing provider details. */
export async function completeSupportCheckout(
  admin: SupabaseClient,
  values: {
    requestId: string;
    token: string;
    outcome: "created" | "failed";
    sessionId?: string;
    errorCategory?: "provider" | "database" | "invalid";
  },
): Promise<boolean> {
  const { data, error } = await admin.rpc(
    "complete_stripe_support_checkout",
    {
      p_request_id: values.requestId,
      p_claim_token: values.token,
      p_outcome: values.outcome,
      p_session_id: values.sessionId ?? null,
      p_error_category: values.errorCategory ?? null,
    },
  );
  return !error && data === true;
}

function occurredAt(created: number): string {
  return new Date(created * 1000).toISOString();
}

/** Finds a support row by its projected intent or immutable request fallback. */
async function findSupportPayment(
  admin: SupabaseClient,
  paymentIntentId: string,
  requestId?: string | null,
): Promise<StripeSupportLookupRow | null> {
  const columns =
    "id,request_id,user_id,livemode,requested_amount,amount_total,amount_refunded,currency,checkout_status,payment_status,outcome_status,stripe_payment_intent_id";
  const direct = await admin
    .from("stripe_support_payments")
    .select(columns)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (direct.error) {
    throw new Error("Stripe support payment unavailable.");
  }
  if (direct.data) return direct.data as StripeSupportLookupRow;
  if (!requestId || !UUID.test(requestId)) return null;

  const fallback = await admin
    .from("stripe_support_payments")
    .select(columns)
    .eq("request_id", requestId)
    .maybeSingle();
  if (fallback.error) {
    throw new Error("Stripe support payment unavailable.");
  }
  if (!fallback.data) return null;
  const row = fallback.data as StripeSupportLookupRow;
  if (
    row.stripe_payment_intent_id &&
    row.stripe_payment_intent_id !== paymentIntentId
  ) {
    throw new StripeSupportProjectionError(
      "Stripe support PaymentIntent mismatch.",
    );
  }
  return row;
}

/** Validates one current support Session against its immutable server request. */
export function supportSessionProjection(
  row: StripeSupportPaymentRow,
  session: Stripe.Checkout.Session,
  event: Pick<Stripe.Event, "id" | "created" | "type">,
) {
  const requestId = session.metadata?.support_request_id;
  const paymentIntentId = stripeObjectId(session.payment_intent);
  const checkoutStatus = session.status;
  const paymentStatus = session.payment_status;
  if (
    session.mode !== "payment" ||
    session.livemode !== row.livemode ||
    session.client_reference_id !== row.request_id ||
    session.metadata?.purpose !== "biblequest_support" ||
    requestId !== row.request_id ||
    session.currency !== SUPPORT_CURRENCY ||
    session.amount_total !== row.requested_amount ||
    !isSupportAmount(session.amount_total) ||
    checkoutStatus === null ||
    !["open", "complete", "expired"].includes(checkoutStatus) ||
    !["unpaid", "paid"].includes(paymentStatus) ||
    (
      checkoutStatus === "complete" &&
      paymentStatus === "paid" &&
      !paymentIntentId
    )
  ) {
    throw new StripeSupportProjectionError(
      "Stripe support Session mismatch.",
    );
  }
  let outcome = row.outcome_status;
  if (!TERMINAL_ADJUSTMENTS.has(outcome)) {
    outcome =
      checkoutStatus === "expired"
        ? "expired"
        : checkoutStatus === "complete" && paymentStatus === "paid"
          ? "completed"
          : event.type === "checkout.session.async_payment_failed"
            ? "payment_failed"
            : "pending";
  }

  return {
    amount_total: session.amount_total,
    stripe_payment_intent_id: paymentIntentId,
    checkout_status: checkoutStatus,
    payment_status: paymentStatus,
    outcome_status: outcome,
    completed_at:
      checkoutStatus === "complete" && paymentStatus === "paid"
        ? occurredAt(event.created)
        : null,
    expired_at:
      checkoutStatus === "expired" ? occurredAt(event.created) : null,
    last_stripe_event_created: event.created,
    last_stripe_event_id: event.id,
    synchronized_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Reconciles a current support Checkout Session when its route row exists. */
export async function synchronizeSupportSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session,
  event: Pick<Stripe.Event, "id" | "created" | "type">,
): Promise<boolean> {
  const { data, error } = await admin
    .from("stripe_support_payments")
    .select(
      "id,request_id,user_id,livemode,requested_amount,amount_total,amount_refunded,currency,checkout_status,payment_status,outcome_status",
    )
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (error) throw new Error("Stripe support payment unavailable.");
  if (!data) return false;
  const projection = supportSessionProjection(
    data as StripeSupportPaymentRow,
    session,
    event,
  );
  const { error: updateError } = await admin
    .from("stripe_support_payments")
    .update(projection)
    .eq("id", data.id);
  if (updateError) throw new Error("Stripe support payment unavailable.");
  return true;
}

/** Validates a current Charge and computes cumulative refund posture. */
export function supportRefundProjection(
  row: StripeSupportPaymentRow,
  charge: Stripe.Charge,
  event: Pick<Stripe.Event, "id" | "created">,
) {
  if (
    charge.livemode !== row.livemode ||
    charge.currency !== row.currency ||
    charge.amount !== row.requested_amount ||
    charge.amount_refunded < 0 ||
    charge.amount_refunded > row.requested_amount
  ) {
    throw new StripeSupportProjectionError(
      "Stripe support refund mismatch.",
    );
  }
  const outcome =
    charge.amount_refunded === row.requested_amount
      ? "refunded"
      : charge.amount_refunded > 0
        ? "partially_refunded"
        : DISPUTE_OUTCOMES.has(row.outcome_status)
          ? row.outcome_status
          : "completed";
  return {
    amount_refunded: charge.amount_refunded,
    outcome_status: outcome,
    last_stripe_event_created: event.created,
    last_stripe_event_id: event.id,
    synchronized_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Applies cumulative refund state only to a known one-time support intent. */
export async function synchronizeSupportRefund(
  admin: SupabaseClient,
  charge: Stripe.Charge,
  event: Pick<Stripe.Event, "id" | "created">,
  requestId?: string | null,
): Promise<boolean> {
  const paymentIntentId = stripeObjectId(charge.payment_intent);
  if (!paymentIntentId) return false;
  const data = await findSupportPayment(
    admin,
    paymentIntentId,
    requestId,
  );
  if (!data) return false;
  const projection = supportRefundProjection(
    data,
    charge,
    event,
  );
  const { error: updateError } = await admin
    .from("stripe_support_payments")
    .update({
      ...projection,
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("id", data.id);
  if (updateError) throw new Error("Stripe support payment unavailable.");
  return true;
}

/** Validates a current Charge and maps the bounded dispute lifecycle. */
export function supportDisputeProjection(
  row: StripeSupportPaymentRow,
  charge: Stripe.Charge,
  dispute: Stripe.Dispute,
  event: Pick<Stripe.Event, "id" | "created">,
) {
  if (
    charge.livemode !== row.livemode ||
    dispute.livemode !== row.livemode ||
    charge.currency !== row.currency ||
    dispute.currency !== row.currency ||
    charge.amount !== row.requested_amount ||
    dispute.amount <= 0 ||
    dispute.amount > row.requested_amount ||
    stripeObjectId(dispute.charge) !== charge.id
  ) {
    throw new StripeSupportProjectionError(
      "Stripe support dispute mismatch.",
    );
  }
  return {
    dispute_status: dispute.status,
    outcome_status:
      dispute.status === "won"
        ? "dispute_won"
        : dispute.status === "lost"
          ? "dispute_lost"
          : "disputed",
    last_stripe_event_created: event.created,
    last_stripe_event_id: event.id,
    synchronized_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Applies dispute state only to a known one-time support intent. */
export async function synchronizeSupportDispute(
  admin: SupabaseClient,
  charge: Stripe.Charge,
  dispute: Stripe.Dispute,
  event: Pick<Stripe.Event, "id" | "created">,
  requestId?: string | null,
): Promise<boolean> {
  const paymentIntentId = stripeObjectId(charge.payment_intent);
  if (!paymentIntentId) return false;
  const data = await findSupportPayment(
    admin,
    paymentIntentId,
    requestId,
  );
  if (!data) return false;
  const projection = supportDisputeProjection(
    data,
    charge,
    dispute,
    event,
  );
  const { error: updateError } = await admin
    .from("stripe_support_payments")
    .update({
      ...projection,
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("id", data.id);
  if (updateError) throw new Error("Stripe support payment unavailable.");
  return true;
}

/** Validates an existing idempotent Session before returning its hosted URL. */
export function supportCheckoutUrl(
  session: Stripe.Checkout.Session,
  values: {
    requestId: string;
    amount: number;
    livemode: boolean;
  },
): string | null {
  if (
    session.mode !== "payment" ||
    session.livemode !== values.livemode ||
    session.client_reference_id !== values.requestId ||
    session.status !== "open" ||
    session.metadata?.purpose !== "biblequest_support" ||
    session.metadata?.support_request_id !== values.requestId ||
    session.currency !== SUPPORT_CURRENCY ||
    session.amount_total !== values.amount ||
    !session.url
  ) {
    return null;
  }
  try {
    const url = new URL(session.url);
    return url.origin === "https://checkout.stripe.com" &&
      !url.username &&
      !url.password
      ? session.url
      : null;
  } catch {
    return null;
  }
}
