# Security notes

- Keep the secret key on the server. Do not pass it as admin server props or import the server entry point from a client component.
- This plugin does not expose transfer or payout operations.
- Resolve prices and customer email from server-side records. Browser checkout input contains only an order identifier.
- Configure Payload admin authentication. Payment and billing collections are readable only by the configured admin user collection; direct writes are disabled.
- Use HTTPS and configure Paystack's webhook URL in the dashboard.
- Transaction verification checks reference, amount, and currency against the locally created transaction before updating its status.
- Webhook charge events only mark a stored transaction paid when the provider amount and currency match the server-created transaction. Unknown or mismatched references are retained with `review` status for reconciliation.
- Store only fields needed by your billing workflow. Review providerData retention for your privacy requirements.
