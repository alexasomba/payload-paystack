# Payload Paystack demo app

Create a PostgreSQL database and copy .env.example to .env.local. Add a user in the Payload admin, then create a pending order with email, amountMinor, and currency. Set NEXT_PUBLIC_DEMO_ORDER_ID to that order ID to try the hosted checkout.

The Paystack key must be a test key for local development. Webhooks require a publicly reachable local tunnel if you want to exercise asynchronous updates.
