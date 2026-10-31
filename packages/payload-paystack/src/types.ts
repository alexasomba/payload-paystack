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
