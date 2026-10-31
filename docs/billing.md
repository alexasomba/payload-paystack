# Billing workflows

The package exposes the complete typed Paystack client from its server entry point. The plugin stores plans, subscriptions, refunds, disputes, transactions, and webhook events in Payload. Its authenticated management endpoints create, list, and update plans, create subscriptions and refunds, and list disputes. Use the server SDK for subscription lifecycle operations and dispute evidence or resolution.

Paystack amount values are integer currency subunits. The configured resolveCheckout callback is responsible for checking order ownership and payable state before returning an amount.

Webhook signatures are computed over the exact raw request body with HMAC SHA-512. Invalid signatures are rejected before JSON parsing. The event key is a SHA-256 digest of the body, and repeated successful deliveries return an acknowledgment without repeating updates.
