# payload-paystack-payments

Paystack checkout and billing workflows for Payload CMS 3.

## Install

pnpm add payload-paystack-payments

## Configure

Register paystackPlugin in your Payload config. Keep PAYSTACK_SECRET_KEY on the server and provide resolveCheckout to load and validate a payable order. The callback returns the customer's email, amount as an integer in currency subunits, and currency.

The checkout component accepts an order ID and redirects to Paystack hosted checkout. It never accepts a client-supplied amount. A signed `charge.success` or `charge.failed` webhook is treated as a notification: the server re-verifies the reference, amount, and currency with Paystack before updating the transaction. Verification outages fail the webhook so Paystack can retry.

The plugin adds Payload collections for transactions, plans, subscriptions, refunds, disputes, and webhook events, plus a custom payment management view. Authenticated plan, subscription, refund, and dispute management endpoints are available under `/api/paystack`. Configure your Paystack dashboard to send events to `/api/paystack/webhook`.

## Entry points

- payload-paystack-payments — Payload plugin and option types
- payload-paystack-payments/server — typed Paystack client and server billing helpers
- payload-paystack-payments/react — hosted checkout component
- payload-paystack-payments/admin — Payload admin view and navigation link

## Use with an existing order flow

Import the server entry point when an application already owns its Payload ecommerce transaction, stock, or order-finalization flow. It exports the typed Paystack client, checkout initialization and verification helpers, and raw-body webhook signature verification. Keep payable-order validation and `finalizeOrder` in the application's `PaymentAdapter`; the standalone plugin routes and collections are optional and should not be enabled as a second checkout ledger.

## Compatibility

Payload 3.79.1 or newer, or Payload 4.0.0-beta.6 or newer; React 19.2.1 or newer; Node.js 22 or newer.

## License

MIT
