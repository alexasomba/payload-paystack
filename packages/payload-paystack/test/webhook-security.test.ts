import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { paystackPlugin } from "../src/plugin.js";
import { verifyPaystackWebhookSignature } from "../src/server.js";
import { webhookEventKey } from "../src/internal/shared.js";

const secret = "sk_test_fixture_only";
const body = '{"event":"charge.success","data":{"reference":"order-17","amount":2500,"currency":"NGN"}}';

function signature(rawBody: string) {
  return createHmac("sha512", secret).update(rawBody).digest("hex");
}

function memoryPayload() {
  const records = new Map<string, Array<Record<string, unknown> & { id: string }>>();
  let nextId = 0;
  const payload = {
    find: async ({ collection, where }: { collection: string; where: Record<string, { equals: string }> }) => {
      const [field, condition] = Object.entries(where)[0] ?? [];
      const docs = records.get(collection) ?? [];
      return { docs: docs.filter((doc) => doc[field ?? ""] === condition?.equals).slice(0, 1) };
    },
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      const docs = records.get(collection) ?? [];
      const doc = { ...data, id: String(++nextId) };
      docs.push(doc);
      records.set(collection, docs);
      return doc;
    },
    update: async ({ collection, id, data }: { collection: string; id: string; data: Record<string, unknown> }) => {
      const docs = records.get(collection) ?? [];
      const index = docs.findIndex((doc) => doc.id === id);
      const doc = { ...docs[index], ...data };
      docs[index] = doc;
      return doc;
    },
  };
  return { records, payload };
}

function webhookHandler(fetch: typeof globalThis.fetch) {
  const config = paystackPlugin({ secretKey: secret, fetch })({
    admin: { user: "users" },
    collections: [],
    endpoints: [],
  } as never);
  return config.endpoints?.find((endpoint) => endpoint.path === "/paystack/webhook")?.handler as unknown as
    (req: never) => Promise<Response>;
}

describe("Paystack webhook security", () => {
  it("accepts an HMAC signature for the exact raw body", () => {
    expect(verifyPaystackWebhookSignature({ rawBody: body, signature: signature(body), secretKey: secret })).toBe(true);
  });

  it("rejects a signature for modified JSON whitespace", () => {
    expect(verifyPaystackWebhookSignature({ rawBody: body + " ", signature: signature(body), secretKey: secret })).toBe(false);
  });

  it("rejects missing and malformed signatures", () => {
    expect(verifyPaystackWebhookSignature({ rawBody: body, signature: null, secretKey: secret })).toBe(false);
    expect(verifyPaystackWebhookSignature({ rawBody: body, signature: "not-hex", secretKey: secret })).toBe(false);
    expect(verifyPaystackWebhookSignature({ rawBody: body, signature: signature(body), secretKey: "" })).toBe(false);
  });

  it("derives a deterministic idempotency key from the exact event body", () => {
    expect(webhookEventKey(body)).toBe(webhookEventKey(body));
    expect(webhookEventKey(body)).not.toBe(webhookEventKey(body + " "));
  });

  it("registers billing collections, protected routes, and secret-free admin props", () => {
    const config = paystackPlugin({ secretKey: secret })({
      admin: { user: "users" },
      collections: [],
      endpoints: [],
    } as never);
    const slugs = config.collections?.map((item) => item.slug) ?? [];
    const paths = config.endpoints?.map((item) => item.path) ?? [];
    const adminJson = JSON.stringify(config.admin?.components?.views);

    expect(slugs).toContain("paystack-transactions");
    expect(slugs).toContain("paystack-webhook-events");
    expect(paths).toContain("/paystack/webhook");
    expect(paths).toContain("/paystack/refunds");
    expect(adminJson).not.toContain(secret);
  });

  it("rejects an invalid delivery before touching Payload", async () => {
    const config = paystackPlugin({ secretKey: secret })({
      admin: { user: "users" },
      collections: [],
      endpoints: [],
    } as never);
    const webhook = config.endpoints?.find((endpoint) => endpoint.path === "/paystack/webhook")?.handler as unknown as
      (req: never) => Promise<Response>;
    const find = vi.fn();
    const response = await webhook({
      text: async () => body,
      headers: new Headers({ "x-paystack-signature": "invalid" }),
      payload: { find },
    } as never);

    expect(response.status).toBe(401);
    expect(find).not.toHaveBeenCalled();
  });

  it("processes a signed webhook once and acknowledges a duplicate delivery", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      status: true,
      message: "ok",
      data: { id: 17, reference: "order-17", amount: 2500, currency: "NGN", status: "success" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const webhook = webhookHandler(fetch);
    const { records, payload } = memoryPayload();
    records.set("paystack-transactions", [{
      id: "transaction-1",
      reference: "order-17",
      amount: 2500,
      currency: "NGN",
      status: "pending",
    }]);
    const signedRequest = () => ({ text: async () => body, headers: new Headers({ "x-paystack-signature": signature(body) }), payload });

    const first = await webhook(signedRequest() as never);
    const duplicate = await webhook(signedRequest() as never);
    const transactionRows = records.get("paystack-transactions") ?? [];
    const eventRows = records.get("paystack-webhook-events") ?? [];

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(transactionRows).toHaveLength(1);
    expect(transactionRows[0]).toMatchObject({ amount: 2500, currency: "NGN", status: "success" });
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]?.status).toBe("processed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps an event amount mismatch in review without changing the expected amount", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      status: true,
      message: "ok",
      data: { id: 17, reference: "order-17", amount: 2500, currency: "NGN", status: "success" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const webhook = webhookHandler(fetch);
    const { records, payload } = memoryPayload();
    records.set("paystack-transactions", [{
      id: "transaction-1",
      reference: "order-17",
      amount: 2500,
      currency: "NGN",
      status: "pending",
    }]);
    const rawBody = '{"event":"charge.success","data":{"reference":"order-17","amount":1200,"currency":"NGN"}}';
    const response = await webhook({
      text: async () => rawBody,
      headers: new Headers({ "x-paystack-signature": signature(rawBody) }),
      payload,
    } as never);

    expect(response.status).toBe(200);
    expect(records.get("paystack-transactions")?.[0]).toMatchObject({ amount: 2500, currency: "NGN", status: "review" });
  });

  it("does not trust a signed event when Paystack verification disagrees with the stored transaction", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      status: true,
      message: "ok",
      data: { id: 17, reference: "order-17", amount: 1200, currency: "NGN", status: "success" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const webhook = webhookHandler(fetch);
    const { records, payload } = memoryPayload();
    records.set("paystack-transactions", [{
      id: "transaction-1",
      reference: "order-17",
      amount: 2500,
      currency: "NGN",
      status: "pending",
    }]);
    const response = await webhook({
      text: async () => body,
      headers: new Headers({ "x-paystack-signature": signature(body) }),
      payload,
    } as never);

    expect(response.status).toBe(200);
    expect(records.get("paystack-transactions")?.[0]).toMatchObject({ amount: 2500, currency: "NGN", status: "review" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not mark a transaction successful while the provider still reports pending", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      status: true,
      message: "ok",
      data: { id: 17, reference: "order-17", amount: 2500, currency: "NGN", status: "pending" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const webhook = webhookHandler(fetch);
    const { records, payload } = memoryPayload();
    records.set("paystack-transactions", [{
      id: "transaction-1",
      reference: "order-17",
      amount: 2500,
      currency: "NGN",
      status: "pending",
    }]);
    const response = await webhook({
      text: async () => body,
      headers: new Headers({ "x-paystack-signature": signature(body) }),
      payload,
    } as never);

    expect(response.status).toBe(200);
    expect(records.get("paystack-transactions")?.[0]).toMatchObject({ status: "pending" });
  });

  it("returns a retryable error when provider verification is unavailable", async () => {
    const fetch = vi.fn(async () => new Response("temporarily unavailable", { status: 503 }));
    const webhook = webhookHandler(fetch);
    const { records, payload } = memoryPayload();
    records.set("paystack-transactions", [{
      id: "transaction-1",
      reference: "order-17",
      amount: 2500,
      currency: "NGN",
      status: "pending",
    }]);
    const response = await webhook({
      text: async () => body,
      headers: new Headers({ "x-paystack-signature": signature(body) }),
      payload,
    } as never);

    expect(response.status).toBe(500);
    expect(records.get("paystack-transactions")?.[0]).toMatchObject({ status: "pending" });
    expect(records.get("paystack-webhook-events")?.[0]).toMatchObject({ status: "failed" });
  });
});
