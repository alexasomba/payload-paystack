import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { CollectionSlug, Config, PayloadRequest } from "payload";
import type { PaystackPluginOptions } from "../types.js";

export const defaultSlugs = {
  transactions: "paystack-transactions",
  plans: "paystack-plans",
  subscriptions: "paystack-subscriptions",
  refunds: "paystack-refunds",
  disputes: "paystack-disputes",
  webhookEvents: "paystack-webhook-events",
} as const;

export function resolveSlugs(options: PaystackPluginOptions) {
  return { ...defaultSlugs, ...options.collectionSlugs };
}

export function resolveSecret(options: PaystackPluginOptions): string {
  const secret = options.secretKey ?? process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY is required on the server.");
  return secret;
}

export function makeReference(prefix = "ps"): string {
  return prefix + "-" + randomUUID().replaceAll("-", "");
}

export function safeJson(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function webhookEventKey(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function verifyWebhookSignature(input: {
  rawBody: string;
  signature: string | null;
  secretKey: string;
}): boolean {
  if (!input.secretKey || !input.signature || !/^[a-f0-9]{128}$/i.test(input.signature)) return false;
  const expected = createHmac("sha512", input.secretKey).update(input.rawBody).digest();
  const received = Buffer.from(input.signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function adminCollection(config: Config): string | undefined {
  const user = config.admin?.user;
  return typeof user === "string" ? user : undefined;
}

export function isAdminRequest(req: PayloadRequest, collection: string | undefined): boolean {
  if (!req.user) return false;
  return collection ? req.user.collection === collection : false;
}

export function collectionAccess(collection: string | undefined) {
  return {
    read: ({ req }: { req: PayloadRequest }) => isAdminRequest(req, collection),
    create: () => false,
    update: () => false,
    delete: () => false,
  };
}

export function requireAdmin(req: PayloadRequest, collection: string | undefined): Response | null {
  return isAdminRequest(req, collection)
    ? null
    : Response.json({ error: "Administrator access is required." }, { status: 403 });
}

export function asCollectionSlug(value: string): CollectionSlug {
  return value as CollectionSlug;
}
