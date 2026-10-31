import {
  assertOk,
  createPaystack,
  type Paystack,
  type PaystackClientOptions,
  type PlanCreatePayload,
  type SubscriptionCreatePayload,
} from "@alexasomba/paystack-node";
import type { PaystackPluginOptions } from "./types.js";
import { resolveSecret } from "./internal/shared.js";

export type PaystackCurrency = "GHS" | "KES" | "NGN" | "ZAR" | "USD" | "XOF";

export type { Paystack, PaystackClientOptions, PlanCreatePayload, SubscriptionCreatePayload };
export { assertOk, createPaystack };

export function createPayloadPaystack(
  options: PaystackPluginOptions & Partial<Pick<PaystackClientOptions, "fetch" | "timeoutMs">>,
): Paystack {
  return createPaystack({
    secretKey: resolveSecret(options),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    idempotencyKey: "auto",
  });
}

export async function initializePaystackCheckout(
  client: Paystack,
  input: {
    email: string;
    amount: number;
    currency: PaystackCurrency;
    reference: string;
    callback_url?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const result = await client.transaction.initialize({
    body: {
      email: input.email,
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      ...(input.callback_url ? { callback_url: input.callback_url } : {}),
      ...(input.metadata ? { metadata: input.metadata as never } : {}),
    },
  });
  return assertOk(result);
}

export async function verifyPaystackTransaction(client: Paystack, reference: string) {
  return assertOk(await client.transaction.verify(reference));
}

export async function createPaystackRefund(
  client: Paystack,
  input: { transaction: string; amount?: number; customer_note?: string; merchant_note?: string },
) {
  return assertOk(await client.refund.create({ body: input }));
}

export async function createPaystackSubscription(client: Paystack, input: SubscriptionCreatePayload) {
  return assertOk(await client.subscription.create({ body: input }));
}

export async function createPaystackPlan(client: Paystack, input: PlanCreatePayload) {
  return assertOk(await client.plan.create({ body: input }));
}

export async function listPaystackPlans(client: Paystack) {
  return assertOk(await client.plan.list({ params: { query: { perPage: 100 } } }));
}

export async function updatePaystackPlan(client: Paystack, planCode: string, input: Record<string, unknown>) {
  return assertOk(await client.plan.update(planCode, { body: input as never }));
}
