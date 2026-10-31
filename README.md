# Payload Paystack

Paystack checkout and billing workflows for Payload CMS 3, including plans, subscriptions, refunds, and disputes.

The repository contains the publishable package, a Payload demo application, and implementation documentation.

## Install

pnpm add @alexasomba/payload-paystack

The package uses @alexasomba/paystack-node for typed Paystack API calls.

## Package entry points

- The package root exports the Payload plugin and options.
- The server entry point exports the Paystack server client and billing helpers.
- The React entry point exports hosted-checkout components.
- The admin entry point exports the payment management view.

## Development

Run pnpm install, then pnpm check. Run the demo with pnpm --filter payload-paystack-demo dev after configuring a Payload database and PAYSTACK_SECRET_KEY.

## Security

Keep PAYSTACK_SECRET_KEY on the server. Checkout amounts are resolved by a server callback from an order identifier; browser input never sets the charged amount. Paystack webhook signatures are checked against the raw request body before event handling.

## License

MIT
