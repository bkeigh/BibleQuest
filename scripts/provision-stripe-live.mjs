import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import Stripe from "stripe";

const API_VERSION = "2026-06-24.dahlia";
const APP_ORIGIN = "https://www.biblequest.co";
const CONFIRMATION = "provision BibleQuest Stripe live";
const PRODUCT_METADATA = {
  biblequest_catalog: "plus",
  biblequest_environment: "live",
};
const PRICE_DEFINITIONS = [
  {
    key: "monthly",
    lookupKey: "biblequest_plus_monthly",
    nickname: "BibleQuest Plus Monthly",
    unitAmount: 899,
    recurring: { interval: "month", interval_count: 1 },
  },
  {
    key: "annual",
    lookupKey: "biblequest_plus_annual",
    nickname: "BibleQuest Plus Annual",
    unitAmount: 8_999,
    recurring: { interval: "year", interval_count: 1 },
  },
  {
    key: "lifetime",
    lookupKey: "biblequest_plus_lifetime",
    nickname: "BibleQuest Plus Lifetime",
    unitAmount: 14_499,
    recurring: null,
  },
];
const ARCADE_PRICE_DEFINITIONS = [
  {
    key: "questionSkip",
    lookupKey: "biblequest_arcade_question_skip",
    nickname: "BibleQuest Arcade Question Skip",
    unitAmount: 99,
  },
  {
    key: "gamePass",
    lookupKey: "biblequest_arcade_game_pass",
    nickname: "BibleQuest Arcade Seven Days Game Pass",
    unitAmount: 299,
  },
];
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.finalization_failed",
  "refund.created",
  "refund.updated",
  "refund.failed",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
];

// Reads one required command-line option without placing secrets in argv.
function option(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  if (!value?.slice(prefix.length)) {
    throw new Error(`Missing --${name}.`);
  }
  return value.slice(prefix.length);
}

// Reads and validates a single-line operator secret from a protected file.
async function protectedValue(file, pattern, label) {
  const stat = await fs.stat(file);
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(`${label} file permissions are too broad.`);
  }
  const value = (await fs.readFile(file, "utf8")).trim();
  if (!pattern.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

// Requires the Stripe account to be ready for real charges and payouts.
async function requireReadyAccount(stripe) {
  const account = await stripe.accounts.retrieve();
  const requirements = account.requirements ?? {};
  if (
    !account.charges_enabled ||
    !account.payouts_enabled ||
    !account.details_submitted ||
    (requirements.currently_due ?? []).length > 0 ||
    (requirements.past_due ?? []).length > 0 ||
    requirements.disabled_reason
  ) {
    throw new Error("Stripe live account is not fully enabled.");
  }
}

// Reuses the single BibleQuest Plus product or creates it idempotently.
async function ensureProduct(stripe) {
  const result = await stripe.products.search({
    query: "metadata['biblequest_catalog']:'plus' AND active:'true'",
    limit: 10,
  });
  if (result.data.length > 1) {
    throw new Error("Multiple active BibleQuest Plus products found.");
  }
  const existing = result.data[0];
  if (existing) {
    if (
      existing.name !== "BibleQuest Plus" ||
      existing.metadata.biblequest_environment !== "live"
    ) {
      throw new Error("Existing BibleQuest Plus product does not match.");
    }
    return { product: existing, created: false };
  }
  const product = await stripe.products.create(
    {
      name: "BibleQuest Plus",
      description:
        "Optional premium tools for BibleQuest. Core Bible reading and spiritual content remain free.",
      metadata: PRODUCT_METADATA,
    },
    { idempotencyKey: "biblequest-live-plus-product-v1" },
  );
  return { product, created: true };
}

// Reuses the single BibleQuest Arcade product or creates it idempotently.
async function ensureArcadeProduct(stripe) {
  const result = await stripe.products.search({
    query: "metadata['biblequest_catalog']:'arcade' AND active:'true'",
    limit: 10,
  });
  if (result.data.length > 1) {
    throw new Error("Multiple active BibleQuest Arcade products found.");
  }
  const existing = result.data[0];
  if (existing) {
    if (
      existing.name !== "BibleQuest Arcade" ||
      existing.metadata.biblequest_environment !== "live"
    ) {
      throw new Error("Existing BibleQuest Arcade product does not match.");
    }
    return { product: existing, created: false };
  }
  const product = await stripe.products.create(
    {
      name: "BibleQuest Arcade",
      description:
        "Optional Question Skips and permanent game access for BibleQuest Arcade.",
      metadata: {
        biblequest_catalog: "arcade",
        biblequest_environment: "live",
      },
    },
    { idempotencyKey: "biblequest-live-arcade-product-v1" },
  );
  return { product, created: true };
}

// Proves an existing lookup key or creates the exact approved Price.
async function ensurePrice(stripe, productId, definition) {
  const result = await stripe.prices.list({
    lookup_keys: [definition.lookupKey],
    active: true,
    limit: 10,
  });
  if (result.data.length > 1) {
    throw new Error(`Multiple active Prices found for ${definition.key}.`);
  }
  const existing = result.data[0];
  if (existing) {
    const interval = existing.recurring?.interval ?? null;
    const intervalCount = existing.recurring?.interval_count ?? null;
    const expectedInterval = definition.recurring?.interval ?? null;
    const expectedIntervalCount =
      definition.recurring?.interval_count ?? null;
    if (
      existing.product !== productId ||
      existing.currency !== "usd" ||
      existing.unit_amount !== definition.unitAmount ||
      interval !== expectedInterval ||
      intervalCount !== expectedIntervalCount
    ) {
      throw new Error(`Existing ${definition.key} Price does not match.`);
    }
    return { price: existing, created: false };
  }
  const price = await stripe.prices.create(
    {
      product: productId,
      currency: "usd",
      unit_amount: definition.unitAmount,
      lookup_key: definition.lookupKey,
      nickname: definition.nickname,
      ...(definition.recurring
        ? { recurring: definition.recurring }
        : {}),
      metadata: {
        biblequest_interval: definition.key,
        biblequest_environment: "live",
      },
    },
    { idempotencyKey: `biblequest-live-plus-${definition.key}-price-v1` },
  );
  return { price, created: true };
}

// Proves or creates one exact one-time Arcade Price under its own product.
async function ensureArcadePrice(stripe, productId, definition) {
  const result = await stripe.prices.list({
    lookup_keys: [definition.lookupKey],
    active: true,
    limit: 10,
  });
  if (result.data.length > 1) {
    throw new Error(`Multiple active Prices found for ${definition.key}.`);
  }
  const existing = result.data[0];
  if (existing) {
    if (
      existing.product !== productId ||
      existing.currency !== "usd" ||
      existing.unit_amount !== definition.unitAmount ||
      existing.type !== "one_time" ||
      existing.recurring !== null
    ) {
      throw new Error(`Existing Arcade ${definition.key} Price does not match.`);
    }
    return { price: existing, created: false };
  }
  const price = await stripe.prices.create(
    {
      product: productId,
      currency: "usd",
      unit_amount: definition.unitAmount,
      lookup_key: definition.lookupKey,
      nickname: definition.nickname,
      metadata: {
        biblequest_arcade_product: definition.key,
        biblequest_environment: "live",
      },
    },
    {
      idempotencyKey: `biblequest-live-arcade-${definition.key}-price-v1`,
    },
  );
  return { price, created: true };
}

// Configures the default Customer Portal for safe self-service cancellation.
async function ensurePortal(stripe) {
  const configurations = await stripe.billingPortal.configurations.list({
    active: true,
    limit: 100,
  });
  const existing =
    configurations.data.find((configuration) => configuration.is_default) ??
    configurations.data[0];
  const values = {
    business_profile: {
      headline: "Manage your BibleQuest Plus subscription.",
      privacy_policy_url: `${APP_ORIGIN}/privacy`,
      terms_of_service_url: `${APP_ORIGIN}/terms`,
    },
    features: {
      customer_update: { enabled: false },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        cancellation_reason: {
          enabled: true,
          options: [
            "too_expensive",
            "missing_features",
            "switched_service",
            "unused",
            "customer_service",
            "too_complex",
            "low_quality",
            "other",
          ],
        },
      },
      subscription_pause: { enabled: false },
      subscription_update: { enabled: false },
    },
  };
  if (existing) {
    await stripe.billingPortal.configurations.update(existing.id, values);
    return { created: false };
  }
  await stripe.billingPortal.configurations.create(values);
  return { created: true };
}

// Reuses the exact live webhook endpoint or creates it with a one-time secret.
async function ensureWebhook(stripe) {
  const url = `${APP_ORIGIN}/api/billing/webhook`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const matching = endpoints.data.filter(
    (endpoint) => !endpoint.deleted && endpoint.url === url,
  );
  if (matching.length > 1) {
    throw new Error("Multiple BibleQuest live webhook endpoints found.");
  }
  if (matching[0]) {
    const actualEvents = [...matching[0].enabled_events].sort();
    const expectedEvents = [...WEBHOOK_EVENTS].sort();
    if (JSON.stringify(actualEvents) !== JSON.stringify(expectedEvents)) {
      await stripe.webhookEndpoints.update(matching[0].id, {
        enabled_events: WEBHOOK_EVENTS,
        description: "BibleQuest production billing projection",
      });
    }
    return { endpoint: matching[0], created: false };
  }
  const endpoint = await stripe.webhookEndpoints.create(
    {
      url,
      enabled_events: WEBHOOK_EVENTS,
      description: "BibleQuest production billing projection",
      metadata: {
        biblequest_environment: "live",
      },
    },
    { idempotencyKey: "biblequest-live-webhook-v1" },
  );
  if (!endpoint.secret) {
    throw new Error("Stripe did not return a webhook signing secret.");
  }
  return { endpoint, created: true };
}

// Writes provider values and includes a webhook secret only when newly issued.
async function writeOutput(
  outputFile,
  publishableKey,
  webhookSecret,
  prices,
  arcadePrices,
) {
  const body = [
    `STRIPE_SECRET_KEY_FILE=${path.resolve(option("secret-file"))}`,
    `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${publishableKey}`,
    ...(webhookSecret ? [`STRIPE_WEBHOOK_SECRET=${webhookSecret}`] : []),
    `STRIPE_PLUS_MONTHLY_PRICE_ID=${prices.monthly.id}`,
    `STRIPE_PLUS_ANNUAL_PRICE_ID=${prices.annual.id}`,
    `STRIPE_PLUS_LIFETIME_PRICE_ID=${prices.lifetime.id}`,
    `STRIPE_ARCADE_QUESTION_SKIP_PRICE_ID=${arcadePrices.questionSkip.id}`,
    `STRIPE_ARCADE_GAME_PASS_PRICE_ID=${arcadePrices.gamePass.id}`,
    "",
  ].join("\n");
  await fs.writeFile(outputFile, body, { mode: 0o600, flag: "wx" });
}

// Performs a guarded, idempotent live Stripe provisioning operation.
async function main() {
  if (process.env.BIBLEQUEST_STRIPE_LIVE_PROVISION_CONFIRM !== CONFIRMATION) {
    throw new Error("Exact live provisioning confirmation is required.");
  }
  const secretFile = path.resolve(option("secret-file"));
  const publishableFile = path.resolve(option("publishable-file"));
  const outputFile = path.resolve(option("output"));
  const secretKey = await protectedValue(
    secretFile,
    /^sk_live_[A-Za-z0-9_]+$/,
    "Stripe secret key",
  );
  const publishableKey = await protectedValue(
    publishableFile,
    /^pk_live_[A-Za-z0-9_]+$/,
    "Stripe publishable key",
  );
  const stripe = new Stripe(secretKey, {
    apiVersion: API_VERSION,
    maxNetworkRetries: 2,
    timeout: 10_000,
    appInfo: { name: "BibleQuest", version: "0.1.0" },
  });
  await requireReadyAccount(stripe);
  const product = await ensureProduct(stripe);
  const arcadeProduct = await ensureArcadeProduct(stripe);
  const priceResults = await Promise.all(
    PRICE_DEFINITIONS.map((definition) =>
      ensurePrice(stripe, product.product.id, definition),
    ),
  );
  const prices = Object.fromEntries(
    priceResults.map((result, index) => [
      PRICE_DEFINITIONS[index].key,
      result.price,
    ]),
  );
  const arcadePriceResults = await Promise.all(
    ARCADE_PRICE_DEFINITIONS.map((definition) =>
      ensureArcadePrice(stripe, arcadeProduct.product.id, definition),
    ),
  );
  const arcadePrices = Object.fromEntries(
    arcadePriceResults.map((result, index) => [
      ARCADE_PRICE_DEFINITIONS[index].key,
      result.price,
    ]),
  );
  const portal = await ensurePortal(stripe);
  const webhook = await ensureWebhook(stripe);
  await writeOutput(
    outputFile,
    publishableKey,
    webhook.endpoint.secret ?? null,
    prices,
    arcadePrices,
  );
  process.stdout.write(
    JSON.stringify({
      accountReady: true,
      productCreated: product.created,
      arcadeProductCreated: arcadeProduct.created,
      pricesCreated: priceResults.filter((result) => result.created).length,
      arcadePricesCreated: arcadePriceResults.filter((result) => result.created)
        .length,
      portalCreated: portal.created,
      webhookCreated: webhook.created,
      webhookSecretWritten: Boolean(webhook.endpoint.secret),
      webhookEvents: WEBHOOK_EVENTS.length,
      protectedOutputWritten: true,
    }),
  );
}

await main();
