import { describe, expect, it, vi } from "vitest";
import {
  createPayloadPaystack,
  createPaystackRefund,
  createPaystackPlan,
  createPaystackSubscription,
  initializePaystackCheckout,
  listPaystackPlans,
  verifyPaystackTransaction,
} from "../src/server.js";

function providerFetch(responses: unknown[]) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push({
      url: request.url,
      method: request.method,
      body: request.method === "GET" ? undefined : await request.clone().text(),
    });
    const payload = responses.shift() ?? { status: true, message: "ok", data: {} };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { fetch, calls };
}

describe("Paystack server helpers", () => {
  it("initializes and verifies a checkout through the typed SDK", async () => {
    const mock = providerFetch([
      { status: true, message: "ok", data: { authorization_url: "https://checkout.paystack.com/a", access_code: "a", reference: "ps-1" } },
      { status: true, message: "ok", data: { reference: "ps-1", status: "success", amount: 2500, currency: "NGN" } },
    ]);
    const client = createPayloadPaystack({ secretKey: "sk_test_fixture", fetch: mock.fetch });
    const initialized = await initializePaystackCheckout(client, {
      email: "buyer@example.com",
      amount: 2500,
      currency: "NGN",
      reference: "ps-1",
    });
    const verified = await verifyPaystackTransaction(client, "ps-1");

    expect(initialized.access_code).toBe("a");
    expect(verified.status).toBe("success");
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0]?.url).toContain("/transaction/initialize");
    expect(JSON.parse(mock.calls[0]?.body ?? "{}")).toMatchObject({ amount: 2500, currency: "NGN", reference: "ps-1" });
    expect(mock.calls[1]?.url).toContain("/transaction/verify/ps-1");
  });

  it("supports a loopback provider transport for isolated application tests", async () => {
    const mock = providerFetch([
      { status: true, message: "ok", data: { authorization_url: "https://checkout.paystack.com/a", access_code: "a", reference: "ps-local" } },
    ]);
    const client = createPayloadPaystack({
      secretKey: "sk_test_fixture",
      baseUrl: "http://127.0.0.1:3014",
      fetch: mock.fetch,
    });
    await initializePaystackCheckout(client, {
      email: "buyer@example.com",
      amount: 2500,
      currency: "NGN",
      reference: "ps-local",
    });

    expect(mock.calls[0]?.url).toContain("http://127.0.0.1:3014/transaction/initialize");
  });

  it("creates refunds and subscriptions through provider routes", async () => {
    const mock = providerFetch([
      { status: true, message: "ok", data: { id: 10, status: "pending" } },
      { status: true, message: "ok", data: { subscription_code: "SUB_1", status: "active" } },
    ]);
    const client = createPayloadPaystack({ secretKey: "sk_test_fixture", fetch: mock.fetch });
    const refund = await createPaystackRefund(client, { transaction: "TRX_1", amount: 1000 });
    const subscription = await createPaystackSubscription(client, { customer: "CUS_1", plan: "PLN_1" });

    expect(refund.id).toBe(10);
    expect(subscription.subscription_code).toBe("SUB_1");
    expect(mock.calls[0]?.url).toContain("/refund");
    expect(mock.calls[1]?.url).toContain("/subscription");
  });

  it("creates and lists recurring billing plans", async () => {
    const mock = providerFetch([
      { status: true, message: "ok", data: { plan_code: "PLN_1", name: "Monthly", amount: 2500, interval: "monthly" } },
      { status: true, message: "ok", data: [{ plan_code: "PLN_1", name: "Monthly" }] },
    ]);
    const client = createPayloadPaystack({ secretKey: "sk_test_fixture", fetch: mock.fetch });
    const created = await createPaystackPlan(client, { name: "Monthly", amount: 2500, interval: "monthly" });
    const listed = await listPaystackPlans(client);

    expect(created.plan_code).toBe("PLN_1");
    expect(listed).toHaveLength(1);
    expect(mock.calls[0]?.url).toContain("/plan");
    expect(mock.calls[1]?.url).toContain("/plan?perPage=100");
  });
});
