import type { PaystackClientOptions } from "@alexasomba/paystack-node";
import type { PayloadRequest } from "payload";

export type PaystackCheckoutDetails = {
  email: string;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
  callbackUrl?: string;
};

export type PaystackPluginOptions = {
  secretKey?: string;
  /** Test or proxy transport for server-side provider calls. Never pass this through a browser entry point. */
  fetch?: PaystackClientOptions["fetch"];
  currency?: string;
  callbackUrl?: string;
  resolveCheckout?: (args: {
    req: PayloadRequest;
    orderId: string;
  }) => Promise<PaystackCheckoutDetails | null>;
  collectionSlugs?: Partial<{
    transactions: string;
    plans: string;
    subscriptions: string;
    refunds: string;
    disputes: string;
    webhookEvents: string;
  }>;
  admin?: boolean;
};

export type PaystackCheckoutResult = {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
};
