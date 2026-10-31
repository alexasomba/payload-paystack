"use client";

import { useState } from "react";

export type PaystackCheckoutProps = {
  orderId: string;
  endpoint?: string;
  label?: string;
  className?: string;
  onError?: (error: Error) => void;
};

export function PaystackCheckout({
  orderId,
  endpoint = "/api/paystack/checkout/initialize",
  label = "Pay securely with Paystack",
  className,
  onError,
}: PaystackCheckoutProps) {
  const [pending, setPending] = useState(false);

  async function startCheckout() {
    setPending(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ orderId }),
      });
      const result = (await response.json()) as { authorizationUrl?: string; error?: string };
      if (!response.ok || !result.authorizationUrl) {
        throw new Error(result.error ?? "Unable to start Paystack checkout.");
      }
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error("Paystack checkout failed.");
      onError?.(normalized);
      setPending(false);
    }
  }

  return (
    <button type="button" className={className} disabled={pending} onClick={startCheckout}>
      {pending ? "Connecting to Paystack…" : label}
    </button>
  );
}
