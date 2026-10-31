"use client";

import { PaystackCheckout } from "payload-paystack-payments/react";
import { useState } from "react";

export default function Home() {
  const [orderId, setOrderId] = useState(process.env.NEXT_PUBLIC_DEMO_ORDER_ID ?? "");
  const [message, setMessage] = useState("");
  return (
    <main className="checkout">
      <h1>Payload Paystack demo</h1>
      <p>Enter an order ID created in the Payload admin, then continue to Paystack hosted checkout.</p>
      <label htmlFor="order-id">Order ID</label>
      <input id="order-id" value={orderId} onChange={(event) => setOrderId(event.currentTarget.value)} />
      <PaystackCheckout
        orderId={orderId}
        onError={(error) => setMessage(error.message)}
      />
      {message ? <p role="alert">{message}</p> : null}
      <p>Visit /admin to create a pending order and review payment records.</p>
    </main>
  );
}
