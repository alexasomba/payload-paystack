# payload-paystack-payments

Paystack checkout and billing workflows for Payload CMS 3.

## Install

pnpm add payload-paystack-payments

## Configure

Register paystackPlugin in your Payload config. Keep PAYSTACK_SECRET_KEY on the server and provide resolveCheckout to load and validate a payable order. The callback returns the customer's email, amount as an integer in currency subunits, and currency.

The checkout component accepts an order ID and redirects to Paystack hosted checkout. It never accepts a client-supplied amount.

The plugin adds Payload collections for transactions, plans, subscriptions, refunds, disputes, and webhook events, plus a custom payment management view. Authenticated plan, subscription, refund, and dispute management endpoints are available under `/api/paystack`. Configure your Paystack dashboard to send events to `/api/paystack/webhook`.

## Entry points

- payload-paystack-payments — Payload plugin and option types
- payload-paystack-payments/server — typed Paystack client and server billing helpers
- payload-paystack-payments/react — hosted checkout component
- payload-paystack-payments/admin — Payload admin view and navigation link

## Compatibility

Payload 3.79.1 or newer, React 19.2.1 or newer, Node.js 22 or newer.

## License

MIT
