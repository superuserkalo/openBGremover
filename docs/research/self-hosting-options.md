# Self-hosting options for Beam, Cloudflare Workers, and Supabase

Researched 16 October 2026 for [issue #12](https://github.com/superuserkalo/openBGremover/issues/12).
Repository claims refer to commit `267dfbf`. External claims cite the project
that owns them. Licenses come from the GitHub license API unless stated
otherwise. Nothing here was deployed or benchmarked. Effort and change sizes
are estimates from reading the code.

## Question

What self-hostable pieces could replace Beam (GPU worker), Cloudflare Workers +
Hyperdrive (HTTP API), and Supabase (Postgres + login), so one operator can run
openBGremover on a single GPU machine with `docker compose`? How much code
changes, what does it cost to operate, what are the licenses, and what does the
hosted deployment keep?

## Short answer

- **API runtime:** run the existing Effect handler on **Node 22** with a second
  entry file next to `apps/api/src/index.ts`. `createHandler` already receives
  all platform dependencies (`http.ts` `Dependencies`). The Workers-specific
  parts are only the entry file, the Hyperdrive connection string, the
  `TRIAL_LIMITER` binding, and `waitUntil`.
- **Postgres + login:** use plain Postgres plus **Supabase Auth (GoTrue, MIT)**
  as a single container. `auth.ts` and the web app's `supabase-js` calls keep
  working. Better Auth would mean rewriting both auth surfaces and migrating
  users. Neither option has a committed production schema or signup trigger
  yet, and both need one.
- **Workers/queues:** no queue today. The API is synchronous
  (`docs/migration.md`). A self-hosted worker can be a plain FastAPI container
  that returns binary images. `media.ts` already accepts that response. When
  durable jobs arrive, keep them in Postgres (a `SKIP LOCKED` jobs table, or
  pg-boss). Avoid Celery/RabbitMQ/Redis.
- **Object storage:** not needed today. When it is, code against the S3 API.
  Use **SeaweedFS** (Apache-2.0) or **Garage** (AGPL-3.0) self-hosted and R2/S3
  hosted. Do not adopt MinIO: its GitHub repository is archived and the
  community edition is source-only.
- **Hosted keeps** Workers + Hyperdrive, hosted Supabase, and Beam with
  checkpoints and scale-to-zero. All runtimes share the same handler, SQL, and
  contracts.

## Current coupling (what actually depends on each provider)

| Concern | Where | Provider-specific? |
| --- | --- | --- |
| Request routing, validation, accounting | `http.ts`, `media.ts`, `database.ts`, `body.ts` | No. They use only web-standard `Request`/`Response`/`fetch`/`crypto.subtle`/`AbortSignal.timeout`/`atob`, all global in Node 22 |
| Entry + dependency wiring | `index.ts` | Yes: `ExportedHandler<Env>`, `env.DATABASE.connectionString` (Hyperdrive), `env.TRIAL_LIMITER.limit` (Workers rate-limit binding), `context.waitUntil` |
| Database client | `index.ts` | `pg` `Client` opened and closed per request, which suits Hyperdrive pooling. A long-lived server should use `pg.Pool` instead |
| Session verification | `auth.ts` | Supabase Auth protocol: issuer hard-coded as `${SUPABASE_URL}/auth/v1`, JWKS at `/auth/v1/.well-known/jwks.json`, HS256 fallback via `/auth/v1/user`, deletion via `/auth/v1/admin/users/:id` |
| Web login | `apps/web/lib/supabase.ts`, `app/{login,signup,forgot-password,dashboard}` | `supabase-js` auth only: `signUp`, `signInWithPassword`, `signInWithOAuth`, `resetPasswordForEmail`, `getSession`, `getUser`, `onAuthStateChange`, `signOut`. No PostgREST table access found |
| Schema | `apps/api/test/schema.sql` | A **test fixture only**. The production tables and signup profile trigger exist only in the hosted Supabase project (`docs/migration.md` step 1) |
| GPU inference | `workers/background-removal/app.py` | Beam `@endpoint`, `Volume`, `Output`, `on_start`, `checkpoint_enabled`, `keep_warm_seconds=60` |
| Image handling | `workers/background-removal/imaging.py` | No. Plain Pillow, already unit-tested separately |
| Result delivery | `media.ts` file-delivery branch, `BEAM_OUTPUT_URL_PREFIX` | Beam-specific workaround for stalled responses (`docs/beam-delivery-stall.md`). The binary `image/*` branch and the legacy JSON branch are provider-neutral |

There is no separate CPU worker in the repository. Pillow decode, resize, and
encode run inside the GPU endpoint (`imaging.py`). The issue's "CPU worker"
therefore has nothing to replace yet.

## 1. API runtime

| Option | License | Code change | Ops effort (1–2 people) | Notes |
| --- | --- | --- | --- | --- |
| **Node 22 + small fetch adapter** (recommended) | Node: MIT; `@hono/node-server`: MIT | New `src/node.ts` entry (~40–60 lines). Build `Dependencies` with a `pg.Pool`, an in-process trial limiter, and env values decoded with Effect Schema. Add a Dockerfile | Low: one stateless container | `@hono/node-server` turns a `(Request) => Promise<Response>` into a Node server ([repo](https://github.com/honojs/node-server)). `node:http` plus a hand-written Request conversion is the zero-dependency alternative. Node 22.12+ is already the repo's toolchain (README). `pg` runs natively |
| Bun (`Bun.serve({ fetch })`) | MIT | Similar entry file, no adapter needed | Low | Adds a second JS runtime to test in CI. The repo standardises on npm/Node |
| Self-hosted **workerd** | Apache-2.0 | Reuses the Workers bundle, but Hyperdrive and the rate-limit binding are Cloudflare services. You still need a Postgres socket configuration and a limiter replacement | Medium: Cap'n Proto config, systemd socket setup, fewer operators | The workerd README describes it as an application server for Workers code. It also warns that workerd "is not a hardened sandbox" ([README](https://github.com/cloudflare/workerd#warning-workerd-is-not-a-hardened-sandbox)). That warning matters less for first-party code. It runs the same bundle without removing any of the binding gaps |

**Recommendation:** add a Node entry. The Workers entry stays the hosted path.
Both call `createHandler`, so routing, owner checks, scopes, the
reserve/settle/refund sequence, and body limits stay single-sourced.
Specifics:

- `withDatabase`: use a module-level `pg.Pool` with the same 10 s connect and
  statement timeouts. There is no Hyperdrive, so the query-cache warning in
  `AGENTS.md` does not apply. The pool still must not be put behind a caching
  proxy.
- `allowTrial`: inject a fixed-window counter (single instance), or disable
  the trial when `TRIAL_INTERNAL_API_KEY` is not provisioned. The seam already
  exists as a function, so the handler does not change.
- `waitUntil`: a long-lived Node process keeps running pending promises. Drain
  in-flight requests on `SIGTERM` (`server.close()` before `pool.end()`) so
  accounting completes. That is the equivalent of the bounded `waitUntil`
  guarantee.
- Environment: decode `process.env` with Effect Schema at the boundary
  (AGENTS.md rule). The Workers entry gets typed `Env` from `wrangler types`.

## 2. Postgres + authentication

| Option | License | Code change | Ops effort | Notes |
| --- | --- | --- | --- | --- |
| **Plain Postgres + Supabase Auth (GoTrue) container** (recommended) | Postgres: PostgreSQL License; [supabase/auth](https://github.com/supabase/auth): MIT | Make the issuer and JWKS URL explicit config in `auth.ts` (small). Add a reverse-proxy route so `/auth/v1/*` reaches GoTrue, which `supabase-js` expects. Commit real migrations for `profiles`, `api_keys`, `usage_logs`, and the profile trigger on `auth.users` | Medium-low: two containers plus SMTP config for signup and reset emails | Keeps the web app and `auth.ts` protocol unchanged. Supabase Auth supports asymmetric signing keys (RS256 default, ECC/Ed25519 optional) and HS256 for compatibility ([README](https://github.com/supabase/auth#inherited-features)) |
| Full self-hosted Supabase (`supabase/docker`) | Apache-2.0 ([supabase/supabase](https://github.com/supabase/supabase)) | Same as above | Higher: Studio, Envoy gateway, Auth, PostgREST, Realtime, Storage, imgproxy, postgres-meta, edge-runtime, Postgres, and Supavisor ([compose file](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)) | Most of these services are unused: the API uses Postgres directly and the web app uses only Auth. Worth it only if an operator wants Studio |
| Better Auth in the API or web app | MIT ([repo](https://github.com/better-auth/better-auth)) | Large: replace every `supabase.auth.*` call in four web pages, `auth.ts` verify/delete, and the account-deletion order. Users must be migrated | Low at runtime (a library, no extra service), high one-off migration | The JWT plugin exposes JWKS (default EdDSA; ES256 and others configurable; issuer and audience default to `BASE_URL`) ([docs](https://www.better-auth.com/docs/plugins/jwt)). Its Supabase guide keeps user IDs and bcrypt hashes ([guide](https://www.better-auth.com/docs/guides/supabase-migration-guide)). A reasonable later consolidation, not a prerequisite for self-hosting |

Findings that matter for self-hosting:

1. **Issuer mismatch.** `auth.ts` requires `iss = ${SUPABASE_URL}/auth/v1`.
   Hosted Supabase issues that. The self-hosted Supabase compose sets
   `GOTRUE_JWT_ISSUER: ${API_EXTERNAL_URL}`
   ([compose](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)).
   An ES256/RS256 session would then fail verification unless the operator's
   URL happens to match. Fix: accept an explicit `AUTH_ISSUER` (and optionally
   `AUTH_JWKS_URL`), defaulting to today's derivation so the hosted config is
   unchanged.
2. **HS256 is the self-hosted default.** The same compose file enables
   `GOTRUE_JWT_SECRET` (legacy HS256) and leaves `GOTRUE_JWT_KEYS` commented
   out. `auth.ts` would then validate every request through `/auth/v1/user`: it
   works, but each request makes one auth round trip. Self-host docs should
   tell operators to configure `GOTRUE_JWT_KEYS` with an EC key. This keeps the
   signing-key transition in `docs/migration.md` intact.
3. **No production schema in the repo.** `schema.sql` is explicitly a test
   fixture. A self-host needs versioned migrations: the three tables, the
   signup trigger that creates `profiles`, and the trial service key. Without
   them, `reserveCredit` has no profile row to lock. This is the largest
   prerequisite, and it is needed whichever auth option is chosen.
4. Account deletion stays a two-system operation (app data, then auth user).
   It still is not a distributed transaction (`docs/migration.md`).

## 3. GPU/CPU worker and queues

### Worker process

| Option | License | Code change | Ops effort | Notes |
| --- | --- | --- | --- | --- |
| **Plain HTTP container (FastAPI/uvicorn on a CUDA base image)** (recommended) | FastAPI: MIT | Move `load_model` / `load_warmed_model` / `infer_mask` out of the Beam-decorated `app.py` into a shared module. Add `server.py` (~60 lines): load once at startup, check a bearer token, serialise GPU inference, and return the encoded image with `X-Image-Metadata`. Add a Dockerfile and a model-cache volume | Low-medium: NVIDIA driver plus Container Toolkit on the host; one long-running container | `media.ts` already accepts `image/*` responses with metadata headers, so the API needs **no processor change**. The worker returns binary even when asked for `response_format: "file"`, and `BEAM_OUTPUT_URL_PREFIX` goes unused. Scale-to-zero and checkpoints do not apply to owned hardware: the model stays resident, so there is no cold start after boot |
| Beta9 (Beam's open-source engine) self-hosted | AGPL-3.0 ([repo](https://github.com/beam-cloud/beta9)) | Keep `app.py` nearly as is | High: Kubernetes plus a Helm chart that pulls Redis, a second Redis for JuiceFS, PostgreSQL, Grafana, and VictoriaMetrics ([Chart.yaml](https://github.com/beam-cloud/beta9/blob/main/deploy/charts/beta9/Chart.yaml)). Beam's docs say a self-hosted deployment "does not automatically provide every Cloud feature" ([docs](https://docs.beam.cloud/v2/self-hosting/overview)) | Only worth it for a multi-GPU autoscaling fleet. Checkpoint/restore parity when self-hosted was not confirmed |
| CPU-only container | same | Same as the GPU container. `load_model` already falls back to CPU, without fp16 | Lowest | Works for development and CI. CPU latency for BiRefNet HR at 2048² was **not measured**, so treat it as unacceptable for production until measured |

Sizing: Beam runs this endpoint on an RTX 4090 with 1 CPU and 8 GiB RAM
(`app.py`). Do not assume a smaller GPU fits until peak VRAM at 2048² fp16 has
been measured. The 8 GiB host-RAM rule in `AGENTS.md` still applies. For cost
context: Beam lists a reserved RTX 4090 machine at about $0.44/h, which beats
serverless above roughly 27% occupancy (`docs/beam-pricing-research.md`). An
owned box is the extreme version of that trade: no cold starts, but you pay
for idle time.

### Queues (only when durable jobs are added)

There is no queue today. `docs/migration.md` requires durable jobs,
idempotency, and reconciliation before long-running work, but that is a
separate design. For the self-host shape:

| Option | License | Fit |
| --- | --- | --- |
| **Jobs table in the existing Postgres with `FOR UPDATE SKIP LOCKED`**, claimed by the API process, which calls the worker over HTTP | n/a | Best fit for a small team. SQL stays in `database.ts`. The reservation, job row, and usage can commit in one transaction, and there are no new services. The Python worker stays a stateless HTTP service identical to the Beam endpoint |
| [pg-boss](https://github.com/timgit/pg-boss) | MIT | Node library on Postgres. Use it if retries, scheduling, and throttling would otherwise be rebuilt by hand. Needs a long-lived process, so it suits the Node entry, not Workers |
| [Graphile Worker](https://github.com/graphile/worker) | MIT | Node, Postgres, LISTEN/NOTIFY for millisecond pickup ([site](https://worker.graphile.org/)). Same fit as pg-boss |
| [River](https://github.com/riverqueue/river) | MPL-2.0 | Transactional Postgres queue. Clients for Go, JS/TS, Ruby, and Rust (README), but not Python, which is the worker's language |
| Celery | BSD-3-Clause (GitHub reports `NOASSERTION`) | Needs a Redis or RabbitMQ broker: an extra stateful service to back up, and it splits job state from the accounting database. Not recommended |

Hosted note: Workers cannot run a long-lived poller. The hosted design would
need Cloudflare Queues/Cron, or Beam task queues, to drive the same jobs
table. Decide that in the durable-jobs ticket. The self-host choice above does
not block it.

## 4. Object storage

Not needed by the current synchronous API. Images travel inline, and Beam's
`Output` is internal to Beam. It becomes necessary for async jobs, video, or
large outputs.

| Option | License | Notes |
| --- | --- | --- |
| **S3 API in code**; R2/S3 hosted | n/a | One small function set (put, get, delete, presigned GET) using SigV4. The S3 protocol is the seam, so no provider abstraction is needed |
| [SeaweedFS](https://github.com/seaweedfs/seaweedfs) | Apache-2.0 | Single binary with an S3 gateway. Permissive, active |
| Garage | AGPL-3.0 (per the project; its forge blocked automated license retrieval in this session) | Built for small, mixed-hardware clusters; 1 GB RAM minimum ([site](https://garagehq.deuxfleurs.fr/)). Presigned URLs are implemented; lifecycle expiration is partial; object versioning is unsupported ([S3 compatibility](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/)). `--single-node` has no redundancy ([quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/)) |
| [RustFS](https://github.com/rustfs/rustfs) | Apache-2.0 | Newer MinIO-style server. Check maturity before recommending it |
| MinIO | AGPL-3.0 | **Avoid for new deployments.** The GitHub repository is archived, the README says "THIS REPOSITORY IS NO LONGER MAINTAINED", and the community edition ships as source only, with no pre-compiled binaries ([README](https://github.com/minio/minio)) |
| Local disk volume | n/a | Fine for one box. Without presigned URLs the API must stream files itself. Keep it behind the same put/get functions so S3 can replace it later |

## 5. Reference: how Firecrawl self-hosts

Firecrawl (AGPL-3.0, [repo](https://github.com/firecrawl/firecrawl)) publishes
one root `docker-compose.yaml` and a
[SELF_HOST.md](https://github.com/firecrawl/firecrawl/blob/main/SELF_HOST.md):

- Services: `api` (API plus workers in one container via `harness.js`),
  `playwright-service`, `redis`, `rabbitmq`, `nuq-postgres` (a Postgres-backed
  queue), and optional `foundationdb` for an experimental queue backend. Only
  the API port (3002) is published.
- **Auth is off by default** (`USE_DB_AUTHENTICATION=false`). Hosted
  Firecrawl's Supabase-backed auth is not part of the default self-host, and
  the guide warns the default API is unauthenticated.
- Hosted-only extras (Fire-engine, AI providers, proxies) are opt-in env vars.
- The guide says to pin an exact release tag. It also notes that the compose
  file defines **no persistent volumes** for Postgres, Redis, or RabbitMQ,
  leaving backups to the operator.

What to copy: one compose file at the repo root, pinned images, only the API
exposed, hosted extras behind env vars, and an explicit "you own backups and
security" section. What not to copy: shipping unauthenticated by default.
openBGremover's accounting and key scopes are core behaviour, so its compose
file should include auth. Also avoid three stateful services (Redis, RabbitMQ,
Postgres) where one Postgres is enough.

## Proposed self-host shape

```
compose: caddy (TLS, routes /auth/v1/* → auth, /api/* → api, / → web)
         web     (next start)
         api     (node dist/node.js)            ── pg.Pool ──┐
         auth    (supabase/auth image, MIT)     ─────────────┤
         db      (postgres, volume + backups)  ◄─────────────┘
         gpu     (FastAPI + BiRefNet, nvidia runtime, model-cache volume)
```

Minimal adapter seams, with no provider framework:

1. **Runtime entry:** `index.ts` (Workers) and a new `node.ts`. Both build the
   existing `Dependencies`.
2. **`withDatabase`:** a per-request Hyperdrive `Client`, or a `pg.Pool`.
3. **`allowTrial`:** the Workers rate-limit binding, or an in-process counter.
4. **Auth config:** an explicit issuer and JWKS URL. The protocol stays
   Supabase Auth.
5. **Worker URL + token:** already config. Binary response contract already
   supported.
6. **Python module split:** shared model/inference code; `app.py` (Beam) and
   `server.py` (container) are thin hosts.
7. **Migrations:** committed SQL for tables, the trigger, and the service key.
   Needed in any case.

Estimated change: about 150–250 lines of new code (Node entry, FastAPI host,
Dockerfiles, compose, Caddyfile), a small `auth.ts` config change, a
behaviour-preserving split of `app.py`, and new migrations. No change to
`http.ts`, `media.ts`, `database.ts`, `body.ts`, contracts, or the web app.

## What the hosted deployment keeps

Cloudflare Workers + Hyperdrive (query caching disabled), hosted Supabase with
signing keys, and Beam with warmed checkpoints, the 60 s idle window,
scale-to-zero, and file delivery. The legacy Cloud Run compatibility service
is unaffected. The hosted path only gains the explicit-issuer option, with a
default equal to today's value.

## Licenses

openBGremover is AGPL-3.0. Every recommended component is permissive: Node
(MIT), `@hono/node-server` (MIT), Postgres (PostgreSQL License), Supabase Auth
(MIT), FastAPI (MIT), SeaweedFS (Apache-2.0), and pg-boss/Graphile Worker
(MIT). AGPL services such as Garage or Beta9 run as separate network services.
Using them unmodified adds no obligation beyond what openBGremover already
carries, but modified copies offered over a network must publish their source.
Model weights (BiRefNet HR matting, MIT, pinned revision) download from
Hugging Face on first start, so self-host docs should pin the revision and
cache it in a volume.

## Open questions / what would justify revisiting

- Measure peak VRAM and warm latency on a non-4090 GPU and on CPU before
  publishing hardware requirements.
- If several GPUs or bursty multi-tenant load are needed, compare Beta9
  self-hosted with a plain container plus a Postgres queue, including the
  Kubernetes operating cost.
- If maintaining GoTrue, SMTP, and OAuth configuration costs more than a
  library, revisit Better Auth for both hosted and self-hosted at once. Do not
  fork the auth protocol per deployment.
- The queue choice should be made in the durable-jobs ticket, together with
  the reservation ledger and idempotency keys.
