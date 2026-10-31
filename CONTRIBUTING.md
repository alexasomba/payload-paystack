# Contributing

Use Node.js 22 or newer and pnpm 12.16.1. Install dependencies with pnpm install, then run pnpm check before submitting changes. Add focused Vitest coverage for provider behavior and keep secret-key values in test fixtures only.

The Payload demo uses a local PostgreSQL database. Copy demo/.env.example to demo/.env.local and use Paystack test credentials for provider sandbox work. Do not run live charges or publish an npm release as part of a test run.
