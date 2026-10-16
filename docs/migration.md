# TypeScript API migration

The TypeScript API is deployed at
`https://openbg-api.gantchevkaloyan.workers.dev`. Deployment configuration in
`apps/api/wrangler.jsonc` identifies the existing Supabase project and Hyperdrive
connection. Secrets are configured separately and are not committed.

## Configuration

The optional CPU image worker is configured separately with
`IMAGE_PROCESSING_ENDPOINT_URL`; an empty value disables compression/conversion
without charging requests. See [the image-operation setup and verification](image-processing.md#configure-and-verify-a-deployment).
This does not change `BEAM_ENDPOINT_URL` or the background-removal checkpoint.

1. Keep the existing Supabase project, database, login configuration, and signup
   profile trigger. The API expects the columns shown in `apps/api/test/schema.sql`;
   that file is a **test fixture**, not a production migration. No database changes
   were applied by this work.
2. Create a Cloudflare Hyperdrive connection to that Supabase Postgres instance.
   Disable Hyperdrive query caching: credit balances, key revocation, and usage
   queries must be current. For another deployment, replace the ID in
   `apps/api/wrangler.jsonc`. See the
   [Supabase connection guide](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/).
3. Set `SUPABASE_URL`, `BEAM_ENDPOINT_URL`, and `ALLOWED_ORIGINS` in that config.
   Set `BEAM_OUTPUT_URL_PREFIX` to the HTTPS workspace prefix used by Beam's
   managed file output. The API downloads expiring links internally; see the
   [delivery design and verification](beam-delivery-stall.md).
   Configure Worker secrets `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and
   `BEAM_API_KEY`. Publishable/anon and secret/service-role keys are supported in
   their respective slots. Do not expose the secret/service-role key in web env vars.
4. Deploy the Beam endpoint from `workers/background-removal/app.py` using your
   Beam account. The model is public; a Hugging Face access token is not required.
   Production uses checkpoint restore after model loading and one dummy inference,
   with `keep_warm_seconds=60` and scale-to-zero. Prepare and verify the new
   snapshot before updating either API to a new Beam URL; see the
   [rollout procedure and verification](checkpoint-production-rollout.md).
   The pinned remote model code is fetched on first load. Run representative
   photographs, hair, translucent objects, products, and animated inputs before
   treating quality, memory use, or latency as accepted.
5. Set `NEXT_PUBLIC_API_URL` for the web app. It replaces
   `NEXT_PUBLIC_GO_GATEWAY_URL`. The server-only override is `API_URL`, replacing
   `GO_GATEWAY_URL`. Preserve the web app's Supabase URL and public key.
6. Keep or provision a server-only `bg_` service key in `api_keys` with SHA-256
   `hashed_key`, `is_service=true`, `is_active=true`, and `scopes=ARRAY['trial']`.
   Put the raw key only in the web server's `TRIAL_INTERNAL_API_KEY`. Ordinary
   dashboard keys cannot impersonate trial requests. The public demo is limited
   to 5 requests/minute per Cloudflare location across the demo service key;
   Cloudflare's rate limiter is approximate, not a global spend cap.
7. Run `npm run types -w @openbg/api`, `npm run check`, and both build commands.
   Deploy the API with `npm run deploy -w @openbg/api`, then point the web app at
   it. Verify a real login, key creation, processing request, usage record, and
   failed-request refund before switching traffic.

## Authentication transition

ES256 and RS256 sessions are verified against the project's JWKS endpoint with
issuer, audience, expiry, subject, and authenticated-role checks. Legacy HS256
sessions are validated by Supabase's `/auth/v1/user` endpoint. The old shared
`SUPABASE_JWT_SECRET` is not needed in the Worker. This allows old sessions to
coexist while signing keys rotate; see
[Supabase signing keys](https://supabase.com/docs/guides/auth/signing-keys).

Existing SHA-256-hashed API keys remain usable for image processing and reading
their owner's usage statistics and activity. Account, billing, and key management
now require a Supabase session.
The service key is restricted to removal requests with `X-Usage-Context: trial`.
Trial output is binary image data; other callers receive the shared JSON response.

## Deliberate behavior changes

- The old unauthenticated `/v1/remove-background` route is removed.
- Billing upgrade returns 501 until payment collection exists. Existing prepaid
  balances still work. Unfunded PAYG requests no longer accrue uncollectable usage.
- Failed processing refunds its reservation; malformed input is rejected before
  reservation. Parallel reservations lock the profile row to prevent overspending.
- No automatic retry of GPU requests. The former demo retry could process twice.
- Clicking the upload picker no longer submits a separate GPU warmup job.
- Disabled charts containing hard-coded sample analytics were removed.
- The GPU model preserves soft alpha, supports resize bounds, and emits actual
  JPEG bytes when JPEG is requested. JPEG has no transparency.

## Current limits

This API is synchronous. PostgreSQL reserves a credit before calling Beam and
settles usage afterward. `waitUntil` helps finish accounting after a disconnect,
but it is bounded by the Workers runtime. A process termination or database
failure after reservation can leave a credit reserved without a usage record.
There is no durable reservation ledger, automatic reconciliation, or idempotency
key yet. Add these with queued jobs before expanding to lengthy video operations
or treating accounting as payment-grade.

The live end-to-end test verifies Supabase sign-in, its signup profile trigger,
JWT verification, API key management, Hyperdrive queries, GPU inference, credit
charging, failed-request refunds, and account cleanup. The live schema check also
identified bigint balances; SQL now converts those values to JavaScript numbers.
Unit image masks verify encoding behavior, not model accuracy. A real photograph
confirms inference and alpha output, but does not establish broad model quality
or superiority over BRIA.

Account deletion removes application data before deleting the Supabase auth
user. These are separate systems; if auth deletion fails, retry while the session
is still valid. Do not describe the operation as a distributed transaction.

The local Postgres connection string remains a development placeholder.
The Next.js app remains a separate web deployment; this migration does not port
Next.js to Cloudflare or require a Convex migration.
