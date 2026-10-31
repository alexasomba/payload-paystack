import { assertOk } from "@alexasomba/paystack-node";
import type { CollectionConfig, CollectionSlug, Config, Endpoint, Field, PayloadRequest } from "payload";
import {
  createPayloadPaystack,
  createPaystackPlan,
  initializePaystackCheckout,
  listPaystackPlans,
  updatePaystackPlan,
  verifyPaystackTransaction,
  type PaystackCurrency,
} from "./server.js";
import type { PaystackPluginOptions } from "./types.js";
import {
  adminCollection,
  asCollectionSlug,
  collectionAccess,
  isAdminRequest,
  makeReference,
  requireAdmin,
  resolveSlugs,
  safeJson,
  verifyWebhookSignature,
  webhookEventKey,
} from "./internal/shared.js";

const text = (name: string, required = false, extra: { unique?: boolean; index?: boolean } = {}): Field => ({
  name,
  type: "text",
  required,
  ...extra,
});

const json = (name: string): Field => ({ name, type: "json", admin: { readOnly: true } });

function collection(
  slug: string,
  label: string,
  fields: Field[],
  adminUser: string | undefined,
): CollectionConfig {
  return {
    slug,
    labels: { singular: label, plural: label + "s" },
    admin: { useAsTitle: fields.find((field) => "name" in field)?.name as string | undefined },
    access: collectionAccess(adminUser),
    fields,
  };
}

function buildCollections(slugs: ReturnType<typeof resolveSlugs>, adminUser: string | undefined) {
  const transactionCollection = collection(slugs.transactions, "Paystack transaction", [
    text("reference", true, { unique: true, index: true }),
    text("providerId"),
    { name: "email", type: "email" },
    { name: "amount", type: "number", min: 1, required: true },
    text("currency", true),
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      options: ["pending", "success", "failed", "abandoned", "review"].map((value) => ({ label: value, value })),
    },
    { name: "orderId", type: "text", index: true },
    { name: "authorizationUrl", type: "text" },
    json("providerData"),
  ], adminUser);

  const subscriptionCollection = collection(slugs.subscriptions, "Paystack subscription", [
    text("subscriptionCode", true, { unique: true, index: true }),
    text("customerCode"),
    text("email"),
    text("planCode"),
    text("status"),
    { name: "nextPaymentDate", type: "date" },
    json("providerData"),
  ], adminUser);

  const planCollection = collection(slugs.plans, "Paystack plan", [
    text("planCode", true, { unique: true, index: true }),
    text("name", true),
    { name: "amount", type: "number", min: 1, required: true },
    text("interval", true),
    text("currency", true),
    { name: "invoiceLimit", type: "number", min: 0 },
    text("status"),
    json("providerData"),
  ], adminUser);

  const refundCollection = collection(slugs.refunds, "Paystack refund", [
    text("providerId", true, { unique: true, index: true }),
    text("transactionReference", true, { index: true }),
    { name: "amount", type: "number", min: 1 },
    text("status"),
    json("providerData"),
  ], adminUser);

  const disputeCollection = collection(slugs.disputes, "Paystack dispute", [
    text("providerId", true, { unique: true, index: true }),
    text("transactionReference", false, { index: true }),
    { name: "amount", type: "number" },
    text("currency"),
    text("status"),
    { name: "dueAt", type: "date" },
    json("providerData"),
  ], adminUser);

  const webhookCollection = collection(slugs.webhookEvents, "Paystack webhook event", [
    text("eventKey", true, { unique: true, index: true }),
    text("eventType", true),
    text("resourceReference"),
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "processing",
      options: ["processing", "processed", "failed"].map((value) => ({ label: value, value })),
    },
    json("payload"),
  ], adminUser);

  return [transactionCollection, planCollection, subscriptionCollection, refundCollection, disputeCollection, webhookCollection];
}

function fieldValue(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function paystackCurrency(value: string): PaystackCurrency {
  if (value === "GHS" || value === "KES" || value === "NGN" || value === "ZAR" || value === "USD" || value === "XOF") return value;
  throw new Error("Paystack currency must be GHS, KES, NGN, ZAR, USD, or XOF.");
}

async function findOne(req: PayloadRequest, slug: string, field: string, value: string) {
  const result = await req.payload.find({
    collection: asCollectionSlug(slug),
    where: { [field]: { equals: value } },
    limit: 1,
    overrideAccess: true,
  });
  return result.docs[0];
}

async function saveByField(
  req: PayloadRequest,
  slug: string,
  field: string,
  value: string,
  data: Record<string, unknown>,
) {
  const existing = await findOne(req, slug, field, value);
  if (existing) {
    return req.payload.update({
      collection: asCollectionSlug(slug),
      id: existing.id,
      data,
      overrideAccess: true,
    });
  }
  return req.payload.create({
    collection: asCollectionSlug(slug),
    data: { ...data, [field]: value },
    overrideAccess: true,
  });
}

async function savePlan(req: PayloadRequest, slug: string, value: unknown) {
  const data = safeJson(value);
  const planCode = fieldValue(data.plan_code) ?? fieldValue(data.planCode);
  if (!planCode || typeof data.amount !== "number" || !Number.isSafeInteger(data.amount) || data.amount <= 0) return null;
  return saveByField(req, slug, "planCode", planCode, {
    name: fieldValue(data.name) ?? planCode,
    amount: data.amount,
    interval: fieldValue(data.interval) ?? "monthly",
    currency: fieldValue(data.currency) ?? "NGN",
    invoiceLimit: typeof data.invoice_limit === "number" ? data.invoice_limit : undefined,
    status: data.is_deleted === true ? "deleted" : "active",
    providerData: data,
  });
}

async function processWebhookEvent(
  req: PayloadRequest,
  slugs: ReturnType<typeof resolveSlugs>,
  event: Record<string, unknown>,
  eventKey: string,
) {
  const type = fieldValue(event.event) ?? "unknown";
  const data = safeJson(event.data);
  const reference = fieldValue(data.reference);
  const providerId = fieldValue(data.id);
  const common = { providerData: data };

  if ((type === "charge.success" || type === "charge.failed") && reference) {
    const transaction = await findOne(req, slugs.transactions, "reference", reference);
    const providerAmount = typeof data.amount === "number" ? data.amount : undefined;
    const providerCurrency = fieldValue(data.currency);
    const matches = transaction
      ? transaction.amount === providerAmount && transaction.currency === providerCurrency
      : false;
    const status = matches
      ? type === "charge.success" ? "success" : "failed"
      : "review";
    if (transaction) {
      await req.payload.update({
        collection: asCollectionSlug(slugs.transactions),
        id: transaction.id,
        data: { status, providerData: data, ...(providerId ? { providerId } : {}) },
        overrideAccess: true,
      });
    } else if (providerAmount && providerCurrency) {
      await saveByField(req, slugs.transactions, "reference", reference, {
        providerData: data,
        ...(providerId ? { providerId } : {}),
        email: fieldValue(safeJson(data.customer).email),
        amount: providerAmount,
        currency: providerCurrency,
        status: "review",
      });
    }
  }

  if (type.startsWith("subscription.")) {
    const subscriptionCode = fieldValue(data.subscription_code) ?? fieldValue(data.subscriptionCode);
    if (subscriptionCode) {
      await saveByField(req, slugs.subscriptions, "subscriptionCode", subscriptionCode, {
        ...common,
        customerCode: fieldValue(safeJson(data.customer).customer_code),
        email: fieldValue(safeJson(data.customer).email),
        planCode: fieldValue(safeJson(data.plan).plan_code),
        status: type.endsWith("disable") ? "disabled" : type.endsWith("not_renew") ? "non-renewing" : "active",
        nextPaymentDate: fieldValue(data.next_payment_date),
      });
    }
  }

  if (type.startsWith("refund.")) {
    const refundId = providerId ?? fieldValue(safeJson(data.refund).id);
    const transactionReference = reference ?? fieldValue(safeJson(data.transaction).reference);
    if (refundId && transactionReference) {
      await saveByField(req, slugs.refunds, "providerId", refundId, {
        ...common,
        transactionReference,
        amount: typeof data.amount === "number" ? data.amount : undefined,
        status: type.slice("refund.".length),
      });
    }
  }

  if (type.startsWith("dispute.")) {
    const disputeId = providerId ?? fieldValue(safeJson(data.dispute).id);
    if (disputeId) {
      await saveByField(req, slugs.disputes, "providerId", disputeId, {
        ...common,
        transactionReference: reference ?? fieldValue(safeJson(data.transaction).reference),
        amount: typeof data.amount === "number" ? data.amount : undefined,
        currency: fieldValue(data.currency),
        status: type.slice("dispute.".length),
        dueAt: fieldValue(data.due_at),
      });
    }
  }

  await saveByField(req, slugs.webhookEvents, "eventKey", eventKey, {
    eventType: type,
    resourceReference: reference,
    status: "processed",
    payload: event,
  });
}

function endpoint(
  method: Endpoint["method"],
  path: string,
  handler: Endpoint["handler"],
): Endpoint {
  return { method, path, handler };
}

function parseJsonBody(req: PayloadRequest): Promise<Record<string, unknown>> {
  if (typeof req.json !== "function") return Promise.reject(new Error("Request body is unavailable."));
  return req.json().then(safeJson);
}

export function paystackPlugin(options: PaystackPluginOptions = {}) {
  return (config: Config): Config => {
    const slugs = resolveSlugs(options);
    const adminUser = adminCollection(config);
    const additions = buildCollections(slugs, adminUser);
    const existingSlugs = new Set((config.collections ?? []).map((item) => item.slug));
    for (const item of additions) {
      if (existingSlugs.has(item.slug)) {
        throw new Error("Payload Paystack collection slug already exists: " + item.slug);
      }
    }

    const endpoints: Endpoint[] = [
      endpoint("post", "/paystack/checkout/initialize", async (req) => {
        if (!options.resolveCheckout) {
          return Response.json({ error: "Configure resolveCheckout to validate orders on the server." }, { status: 503 });
        }
        try {
          const input = await parseJsonBody(req);
          const orderId = fieldValue(input.orderId);
          if (!orderId) return Response.json({ error: "orderId is required." }, { status: 400 });
          const details = await options.resolveCheckout({ req, orderId });
          if (!details) return Response.json({ error: "Order not found or not payable." }, { status: 404 });
          if (!Number.isSafeInteger(details.amount) || details.amount <= 0) {
            return Response.json({ error: "Checkout amount must be a positive integer in currency subunits." }, { status: 400 });
          }

          const reference = makeReference();
          const client = createPayloadPaystack(options);
          const data = await initializePaystackCheckout(client, {
            email: details.email,
            amount: details.amount,
            currency: paystackCurrency(details.currency || options.currency || "NGN"),
            reference,
            callback_url: details.callbackUrl ?? options.callbackUrl,
            metadata: details.metadata,
          });
          const providerData = safeJson(data);
          const authorizationUrl = fieldValue(providerData.authorization_url);
          const accessCode = fieldValue(providerData.access_code);
          if (!authorizationUrl || !accessCode) throw new Error("Paystack did not return a checkout URL.");
          await req.payload.create({
            collection: asCollectionSlug(slugs.transactions),
            data: {
              reference,
              email: details.email,
              amount: details.amount,
              currency: details.currency || options.currency || "NGN",
              status: "pending",
              orderId,
              authorizationUrl,
              providerData,
            },
            overrideAccess: true,
          });
          return Response.json({ reference, authorizationUrl, accessCode });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Unable to initialize checkout." },
            { status: 400 },
          );
        }
      }),

      endpoint("post", "/paystack/checkout/verify/:reference", async (req) => {
        const reference = decodeURIComponent(new URL(req.url ?? "/", "http://payload.local").pathname.split("/").at(-1) ?? "");
        if (!reference) return Response.json({ error: "reference is required." }, { status: 400 });
        try {
          const existing = await findOne(req, slugs.transactions, "reference", reference);
          if (!existing) return Response.json({ error: "Transaction not found." }, { status: 404 });
          const data = safeJson(await verifyPaystackTransaction(createPayloadPaystack(options), reference));
          const status = fieldValue(data.status) ?? "unknown";
          const expectedAmount = typeof existing.amount === "number" ? existing.amount : undefined;
          const expectedCurrency = fieldValue(existing.currency);
          const providerAmount = typeof data.amount === "number" ? data.amount : undefined;
          if (data.reference !== reference || providerAmount !== expectedAmount || data.currency !== expectedCurrency) {
            await req.payload.update({
              collection: asCollectionSlug(slugs.transactions),
              id: existing.id,
              data: { status: "review", providerId: fieldValue(data.id), providerData: data },
              overrideAccess: true,
            });
            return Response.json({ error: "Verified transaction does not match the stored payment." }, { status: 409 });
          }
          const normalizedStatus = status === "success" ? "success" : status === "failed" ? "failed" : "pending";
          await req.payload.update({
            collection: asCollectionSlug(slugs.transactions),
            id: existing.id,
            data: { status: normalizedStatus, providerId: fieldValue(data.id), providerData: data },
            overrideAccess: true,
          });
          return Response.json({ reference, status: normalizedStatus });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Unable to verify transaction." },
            { status: 502 },
          );
        }
      }),

      endpoint("post", "/paystack/webhook", async (req) => {
        if (typeof req.text !== "function") {
          return Response.json({ error: "Request body is unavailable." }, { status: 400 });
        }
        const rawBody = await req.text();
        const secret = options.secretKey ?? process.env.PAYSTACK_SECRET_KEY ?? "";
        if (!verifyWebhookSignature({
          rawBody,
          signature: req.headers.get("x-paystack-signature"),
          secretKey: secret,
        })) {
          return Response.json({ error: "Invalid Paystack webhook signature." }, { status: 401 });
        }
        let event: Record<string, unknown>;
        try {
          event = safeJson(JSON.parse(rawBody));
        } catch {
          return Response.json({ error: "Invalid JSON webhook payload." }, { status: 400 });
        }

        const key = webhookEventKey(rawBody);
        let existing = await findOne(req, slugs.webhookEvents, "eventKey", key);
        const processingSince = existing?.status === "processing"
          ? Date.parse(fieldValue(existing.updatedAt) ?? fieldValue(existing.createdAt) ?? "")
          : Number.NaN;
        const processingIsRecent = Number.isFinite(processingSince) && Date.now() - processingSince < 5 * 60 * 1000;
        if (existing?.status === "processed" || (existing?.status === "processing" && processingIsRecent)) {
          return Response.json({ received: true, duplicate: true });
        }
        let claimed = false;
        try {
          if (!existing) {
            try {
              await req.payload.create({
                collection: asCollectionSlug(slugs.webhookEvents),
                data: { eventKey: key, eventType: fieldValue(event.event) ?? "unknown", status: "processing", payload: event },
                overrideAccess: true,
              });
              claimed = true;
            } catch {
              existing = await findOne(req, slugs.webhookEvents, "eventKey", key);
              if (existing) return Response.json({ received: true, duplicate: true });
              throw new Error("Unable to claim webhook event.");
            }
          } else {
            await req.payload.update({
              collection: asCollectionSlug(slugs.webhookEvents),
              id: existing.id,
              data: { status: "processing" },
              overrideAccess: true,
            });
            claimed = true;
          }
          await processWebhookEvent(req, slugs, event, key);
          return Response.json({ received: true });
        } catch (error) {
          const latest = claimed ? await findOne(req, slugs.webhookEvents, "eventKey", key) : undefined;
          if (latest) {
            await req.payload.update({
              collection: asCollectionSlug(slugs.webhookEvents),
              id: latest.id,
              data: { status: "failed" },
              overrideAccess: true,
            });
          }
          console.error("Paystack webhook processing failed.", error);
          return Response.json({ error: "Webhook processing failed." }, { status: 500 });
        }
      }),

      endpoint("post", "/paystack/subscriptions", async (req) => {
        const denied = requireAdmin(req, adminUser);
        if (denied) return denied;
        try {
          const input = await parseJsonBody(req);
          const data = safeJson(assertOk(await createPayloadPaystack(options).subscription.create({
            body: input as never,
          })));
          const subscriptionCode = fieldValue(data.subscription_code);
          if (subscriptionCode) {
            await saveByField(req, slugs.subscriptions, "subscriptionCode", subscriptionCode, {
              providerData: data,
              customerCode: fieldValue(safeJson(data.customer).customer_code),
              email: fieldValue(safeJson(data.customer).email),
              planCode: fieldValue(safeJson(data.plan).plan_code),
              status: fieldValue(data.status) ?? "active",
              nextPaymentDate: fieldValue(data.next_payment_date),
            });
          }
          return Response.json({ subscription: data }, { status: 201 });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Subscription creation failed." }, { status: 400 });
        }
      }),

      endpoint("get", "/paystack/plans", async (req) => {
        const denied = requireAdmin(req, adminUser);
        if (denied) return denied;
        try {
          const plans = await listPaystackPlans(createPayloadPaystack(options));
          const planRows = Array.isArray(plans) ? plans : [];
          for (const plan of planRows) await savePlan(req, slugs.plans, plan);
          return Response.json({ plans: planRows });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Unable to load Paystack plans." }, { status: 502 });
        }
      }),

      endpoint("post", "/paystack/plans", async (req) => {
        const denied = requireAdmin(req, adminUser);
        if (denied) return denied;
        try {
          const input = await parseJsonBody(req);
          if (!fieldValue(input.name) || !Number.isSafeInteger(input.amount) || Number(input.amount) <= 0 || typeof input.interval !== "string") {
            return Response.json({ error: "Plan name, positive integer amount, and interval are required." }, { status: 400 });
          }
          const plan = await createPaystackPlan(createPayloadPaystack(options), input as never);
          await savePlan(req, slugs.plans, plan);
          return Response.json({ plan }, { status: 201 });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Plan creation failed." }, { status: 400 });
        }
      }),

      endpoint("put", "/paystack/plans/:planCode", async (req) => {
        const denied = requireAdmin(req, adminUser);
        if (denied) return denied;
        const planCode = decodeURIComponent(new URL(req.url ?? "/", "http://payload.local").pathname.split("/").at(-1) ?? "");
        if (!planCode) return Response.json({ error: "planCode is required." }, { status: 400 });
        try {
          const input = await parseJsonBody(req);
          const plan = await updatePaystackPlan(createPayloadPaystack(options), planCode, input);
          await savePlan(req, slugs.plans, plan);
          return Response.json({ plan });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Plan update failed." }, { status: 400 });
        }
      }),

      endpoint("post", "/paystack/refunds", async (req) => {
        const denied = requireAdmin(req, adminUser);
        if (denied) return denied;
        try {
          const input = await parseJsonBody(req);
          const transaction = fieldValue(input.transaction);
          if (!transaction) return Response.json({ error: "transaction is required." }, { status: 400 });
          const data = safeJson(assertOk(await createPayloadPaystack(options).refund.create({
            body: input as never,
          })));
          const providerId = fieldValue(data.id);
          if (providerId) {
            await saveByField(req, slugs.refunds, "providerId", providerId, {
              providerData: data,
              transactionReference: transaction,
              amount: typeof data.amount === "number" ? data.amount : input.amount,
              status: fieldValue(data.status) ?? "pending",
            });
          }
          return Response.json({ refund: data }, { status: 201 });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Refund creation failed." }, { status: 400 });
        }
      }),

      endpoint("get", "/paystack/disputes", async (req) => {
        const denied = requireAdmin(req, adminUser);
        if (denied) return denied;
        try {
          const data = safeJson(assertOk(await createPayloadPaystack(options).dispute.list()));
          return Response.json({ disputes: data });
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Unable to load disputes." }, { status: 502 });
        }
      }),
    ];

    config.collections = [...(config.collections ?? []), ...additions];
    config.endpoints = [...(config.endpoints ?? []), ...endpoints];

    if (options.admin !== false) {
      config.admin = {
        ...config.admin,
        components: {
          ...config.admin?.components,
          beforeNavLinks: [
            ...(config.admin?.components?.beforeNavLinks ?? []),
            { path: "@alexasomba/payload-paystack/admin#PaystackAdminNav" },
          ],
          views: {
            ...config.admin?.components?.views,
            paystackPayments: {
              path: "/paystack-payments",
              Component: {
                path: "@alexasomba/payload-paystack/admin#PaystackAdmin",
                serverProps: {
                  transactionsSlug: slugs.transactions,
                  plansSlug: slugs.plans,
                  subscriptionsSlug: slugs.subscriptions,
                  refundsSlug: slugs.refunds,
                  disputesSlug: slugs.disputes,
                },
              },
            },
          },
        },
      };
    }

    return config;
  };
}
