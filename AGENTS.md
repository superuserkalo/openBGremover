# Working on openBGremover

Build media-processing infrastructure that a one- or two-person team can maintain.
Background removal is the implemented operation. The website and future CLI,
SDK, skill, and MCP clients should use the same authenticated HTTP API.

## Architecture and tradeoffs

- Keep HTTP routing and orchestration in `apps/api`, shared API schemas in
  `packages/contracts`, UI in `apps/web`, and GPU inference in
  `workers/background-removal`. Supabase owns Postgres and login; Cloudflare
  Workers connects through Hyperdrive; Beam runs Python inference.
- Extend the existing modules by responsibility. `http.ts` handles routes,
  `auth.ts` identities, `media.ts` processing and accounting orchestration,
  `database.ts` SQL, and `body.ts` bounded reads. Split a module when a concrete
  responsibility needs its own boundary, not to build a controller/service/
  repository hierarchy for every feature.
- Prefer functions and explicit dependencies. Introduce an abstraction when it
  removes real duplication or isolates a dependency that needs testing. Avoid
  generic provider frameworks, new services, and package proliferation for
  hypothetical media operations.
- Give every operation sensible server-owned defaults and optional granular
  overrides. Keep supported options consistent across the HTTP API, SDKs, and
  website. Clients omit untouched options instead of copying server defaults;
  the website puts optional tuning under Advanced settings with a reset action.
  Preserve explicit false and zero values, validate format-specific options,
  and document applied settings and tradeoffs. Required choices such as a
  conversion target remain visible in the primary flow.
- For consequential choices, state the problem, simplest viable option,
  latency/cost/correctness tradeoff, evidence, and what would justify revisiting
  the choice. Keep dated measurements in `docs/`, not in these instructions.
- Use current stable, compatible dependencies for additions and requested
  upgrades. Verify compatibility, update the npm lockfile, and run affected
  checks. Keep model revisions and vendored code pinned and attributable.

## Website and marketing

- Present every operation in the platform catalog (issue #2) as built and
  available, including ones not shipped yet. Never add "soon", "beta",
  "planned", or "coming" labels to the website, demos, or marketing visuals.

## Types, validation, and Effect

- Authored TypeScript must pass strict checking, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, and the root Oxlint configuration. Do not add
  `any`, double assertions, non-null assertions, or TypeScript/lint suppressions
  to bypass a missing model or failed check.
- Decode untrusted HTTP bodies, provider responses, environment values, and
  parsed JSON with Effect Schema at the boundary. Pass concrete domain types
  inward. `unknown` belongs at an untrusted boundary or a caught error, not in
  application parameters, return types, or dictionary aliases as a substitute
  for modeling the data. A type assertion does not validate runtime data.
- Define shared wire contracts once in `packages/contracts` and derive their
  types from schemas. Use discriminated unions for distinct states. Preserve
  literal types and distinguish missing, `undefined`, and `null` deliberately.
- Effect Schema is the existing validation choice. Add Zod only for a concrete
  integration requirement; avoid validating the same contract with two systems.
- Follow the installed Effect version and nearby code. Use typed errors and
  Effect's constructors, matching, and recovery APIs. Keep ordinary leaf
  functions simple; do not add a service or layer for every helper.
- If a third-party type gap genuinely requires an assertion, narrow it at the
  adapter and add the factual safety comment required by the lint rule. Prefer
  schema decoding or `satisfies` when either expresses the actual invariant.
- Dillon Mulroy's generic and Effect anti-slop rules are wired into Oxlint.
  Read `.oxlintrc.json` for enforcement and
  [vendor provenance](tools/oxlint/anti-slop/UPSTREAM.md) before updating them.
  Fix application code rather than weakening rules or changing vendored rules.
  Regenerate generated types with their generator; leave vendor/generated
  exclusions intact instead of hand-editing those files to remove `any`.

## API and accounting invariants

- Keep owner checks, API-key scopes, session-only account/key management, and
  the server-only trial key boundary. New login behavior must preserve the
  supported Supabase signing-key transition described in
  [the migration guide](docs/migration.md).
- Validate inputs before reserving credits. Keep row-locked reservation,
  successful usage recording, and failed-processing refunds together. Keep
  Hyperdrive query caching disabled for balances, revocation, and usage.
- Change the database schema only through new files in `supabase/migrations/`.
  Production predates the CLI's migration history: before running the Supabase
  CLI against it the first time, mark the already-applied migrations with
  `supabase migration repair --status applied 20261016000000 20261016120000`;
  otherwise the CLI tries to recreate existing objects. Keep `apps/api/test/schema.sql` consistent
  with the migrations it models.
- Read the migration guide before changing retries, credits, payments, account
  deletion, or job execution. The synchronous API has no durable reservation
  ledger or idempotency guarantee. Add durable jobs, idempotency, and recovery
  before extending it to long-running work; do not blindly retry paid inference.
- Enforce byte, pixel, frame, and output limits before expensive processing.
  Preserve soft alpha and actual output-format behavior. Check model/code/weight
  licenses for commercial use before replacing a model; keep revision and
  license evidence. Quality claims need representative images.

## Verification and operations

- Inspect `git status` and preserve unrelated changes. Use npm and the committed
  lockfile. For setup and commands, read [README.md](README.md); CI requirements
  live in [.github/workflows/check.yml](.github/workflows/check.yml).
- Commit finished work before handing off; leave nothing you changed uncommitted.
  Commit surgically: one logical change per commit, staging explicit paths
  (`git add <path>...`, never `git add -A` or `git add .`), with a message that
  says what changed and why. Do not stage unrelated changes or ignored files.
- Ship every finished change without waiting to be asked: once its checks
  pass, commit, push `master`, and deploy whatever it touched, then verify the
  live result. Deploy in dependency order:
  1. **Beam workers** (`workers/*`): follow the rollout procedure below and
     verify the new version directly before pointing the API at it.
  2. **API** (`apps/api`): `npm run types -w @openbg/api` if `wrangler.jsonc`
     changed, then `npm run deploy -w @openbg/api`.
  3. **Website** (`apps/web`): pushing `master` deploys it through Vercel; wait
     for the deployment and CI to pass.
  Record deployed versions and the previous version for rollback in `docs/`.
  Never push or deploy failing checks. Production database migrations and
  deleting provider resources still need explicit confirmation first.
- For TypeScript changes, run `npm run check` and the affected app build. For
  Python image handling, run the image-pipeline unittest command in the README.
  Exercise changed behavior and failure paths. Use PGlite for SQL tests and
  injected dependencies instead of module mocks. Docs-only edits need link and
  whitespace checks, not GPU requests. Finish with `git diff --check`.
- Before a GPU deployment or API endpoint switch, read
  [the checkpoint rollout procedure](docs/checkpoint-production-rollout.md) and
  [the latest CPU decision and rollout](docs/beam-one-core-rollout.md).
  Prepare and verify a new checkpoint before routing customer traffic to it.
  Keep inference warmup, checkpoints, the 60-second idle window, and scale-to-zero
  unless the task explicitly changes them. The production API is the
  Cloudflare Worker in `apps/api`; the Go API and its Cloud Run service are
  retired, so never include Cloud Run in a rollout.
- Keep 8 GiB host RAM. For CPU sizing, prioritize cold-start latency over warm
  processing speed. A cheaper allocation needs a controlled cold comparison
  before promotion; do not justify a cold regression with warm-path savings.
- For resource sizing or latency work, read
  [the sizing review](docs/beam-resource-sizing.md) and
  [the CPU comparison](docs/beam-cpu-comparison.md); cold-start background is in
  [the checkpoint comparison](docs/beam-checkpoint-comparison.md). Recheck live
  provider rates and allocation. Compare cost per successful workload, including
  paid idle time, rather than GPU price or inference time alone. A cold sample
  requires observed zero containers; time the complete response and record
  sample count, inputs, configuration, failures, and output correctness.
- Use the opt-in live E2E runner for auth, keys, processing, accounting, and
  production integration changes. Remove temporary accounts and deployments,
  and verify cleanup. Distinguish local tests, live API tests, browser flows,
  model-quality evidence, and estimated costs in the handoff.
- Keep credentials in ignored environment files or provider secret stores.
  Never print bearer tokens, database passwords, signed URLs, or image payloads
  into reports. Beam deployment output can contain an authorization header;
  capture it privately and redact it before sharing. Put raw experiment outputs
  under ignored `artifacts/` and summarize reproducible findings in `docs/`.
