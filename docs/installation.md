# Installation

Install @alexasomba/payload-paystack in a Payload CMS 3 application.

```ts
import { paystackPlugin } from "@alexasomba/payload-paystack";

export default buildConfig({
  plugins: [
    paystackPlugin({
      secretKey: process.env.PAYSTACK_SECRET_KEY,
      resolveCheckout: async ({ req, orderId }) => {
        const order = await req.payload.findByID({
          collection: "orders",
          id: orderId,
          overrideAccess: true,
        });
        if (order.status !== "pending") return null;
        return {
          email: order.email,
          amount: order.amountMinor,
          currency: order.currency,
          metadata: { orderId: String(order.id) },
        };
      },
    }),
  ],
});
```

Render the reusable hosted checkout button from a client component:

```tsx
import { PaystackCheckout } from "@alexasomba/payload-paystack/react";

<PaystackCheckout orderId={order.id} />
```

Add paystackPlugin to the plugins array and set PAYSTACK_SECRET_KEY only in the server environment. Configure resolveCheckout so it loads a pending order from your own collection, checks that the order may be paid, and returns the trusted customer email, integer amount in currency subunits, and currency.

The checkout component accepts an orderId only. It never accepts an amount or currency from the browser.

The plugin adds collections for transactions, plans, subscriptions, refunds, disputes, and webhook events. It also adds a management view under the Payload admin navigation. Authenticated plan endpoints create, list, and update plans; subscription and refund endpoints create those records; the disputes endpoint lists provider disputes. Configure the Paystack webhook URL as your Payload API URL followed by /paystack/webhook.

For migrations, use your configured Payload database adapter and generate/apply Payload migrations after adding the plugin.
