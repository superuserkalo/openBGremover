# openBGremover

Media processing infrastructure for agents. Background removal is the first
implemented operation; the HTTP API is the common entry point for the web app
and future CLI, SDK, and MCP clients.

Agent contributors should read [AGENTS.md](AGENTS.md). `CLAUDE.md` imports that
same guidance. For GPU allocation and cost decisions, read the dated
[Beam sizing review](docs/beam-resource-sizing.md).

## Repository

| Directory | Responsibility |
| --- | --- |
| `apps/api` | TypeScript + Effect API on Cloudflare Workers |
| `apps/web` | Next.js website, Supabase login, dashboard, and public demo |
| `packages/contracts` | Effect Schema request/response definitions shared by both apps |
| `workers/background-removal` | Python/Beam GPU inference and image encoding |
| `workers/image-processing` | libvips compression/conversion (Pillow for AVIF, pillow-heif for HEIC) on CPU-only Beam compute |
| `tools/oxlint/anti-slop` | Vendored Dillon Mulroy anti-slop rules |

Supabase continues to own Postgres and authentication. The API connects to
Postgres through Cloudflare Hyperdrive. The GPU stays on Beam. There is one
API implementation; the former Go API is available in Git history.

Effect handles typed failures and processing orchestration. Effect Schema
validates HTTP and GPU boundaries and supplies their TypeScript types. We do
not also use Zod. All authored TypeScript uses strict checking, checked array
access, exact optional properties, and an Oxlint ban on explicit `any`.

## Local development

Use Node.js 22.12+ and npm. Direct dependencies track current stable releases;
`package-lock.json` records the exact installed dependency graph.

```sh
npm ci
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.example apps/web/.env.local
npm run types -w @openbg/api
npm run dev:api
# In another terminal:
npm run dev:web
```

Set the Supabase URL, Beam URL, and allowed web origins in
`apps/api/wrangler.jsonc`. Put credentials in `.dev.vars`, which is ignored by
Git. The checked-in Hyperdrive ID identifies the existing production connection;
the local connection string is a placeholder. For local requests, point
`localConnectionString` at your development Postgres.
The existing Supabase `profiles`, `api_keys`, and `usage_logs` tables are retained.

The web app uses `NEXT_PUBLIC_API_URL` and its own public Supabase configuration.
Its trial proxy additionally needs a server-only service key with the `trial`
scope. See [the migration guide](docs/migration.md) for configuration and rollout.

## Checks

```sh
npm run check       # TypeScript, Oxlint + anti-slop, PostgreSQL/API/auth tests
npm run build:api   # Cloudflare bundle only; does not deploy
npm run build:web   # Requires public Supabase and API environment variables
npm run test:e2e    # Opt-in live test; requires the private deployment configuration below
python -m pip install -r workers/background-removal/requirements-test.txt
python -m unittest discover -s workers/background-removal -p test_imaging.py -v
python -m pip install -r workers/image-processing/requirements.txt
python -m unittest discover -s workers/image-processing -p test_imaging.py -v
```

The TypeScript tests run SQL in PGlite, an isolated PostgreSQL engine. They do
not contact production Supabase or Beam. The Python tests exercise image
handling with a deterministic mask; they do not prove model quality or GPU
latency. CI runs both sets and builds both applications.

The live test reads the ignored `.env.deployment` file. Set `E2E_API_URL`,
`E2E_IMAGE_PATH`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL`. It creates one temporary account
without sending email, tests mask, binary, and JSON output with three successful
inference charges plus failure refunds, and removes that account afterward.
Reports and image outputs go to the ignored
`artifacts/e2e` directory. Run it only against a deployment you own.

## Website documentation

`/docs` uses Fumadocs, matching the documentation structure on withradian.com.
Edit public articles in `apps/web/content/docs/`; `meta.json` orders the sidebar.
MDX compilation supplies the page outline and search index. Every article also
has a `.md` URL for Copy Markdown. `npm run check` regenerates collection types;
`npm run build:web` compiles the articles and Markdown routes for production.
Generated `.source` files are ignored and should not be edited.

## HTTP API

Static image compression and conversion are implemented at
`POST /api/v1/compress-image` and `POST /api/v1/convert-image`. They use the same
authentication and credit accounting, support JPEG/PNG/WebP, and require the
CPU worker's `IMAGE_PROCESSING_ENDPOINT_URL` binding before becoming available.
Both operations are [deployed and verified in production](docs/image-processing-rollout-2026-10-15.md).
See [request options, response examples, limits, and deployment](docs/image-processing.md).

Send `Authorization: Bearer <API key>` to `POST /api/v1/remove-background` with
JSON containing `image_data` (base64). Optional fields are `format`, `quality`,
`return_mask`, and `resize_options`. The response contains `result_image`
(base64), `processing_time_ms`, and `metadata`.

For a single image, send `Accept: image/*` to receive the encoded image directly,
with its actual `Content-Type` and JSON metadata in `X-Image-Metadata`. Requests
with `return_mask: true` retain the JSON image-and-mask response. Raw image
bodies are also accepted with `Content-Type: application/octet-stream` or an
image content type; these use PNG output, automatic quality, and original
dimensions. Use JSON for explicit format, mask, or resize options.

The demo forwards original files to this same authenticated API. The GPU can
return binary images to avoid a base64 round trip, while legacy GPU JSON and
public API JSON remain supported. Binary results are bounded at 12 MiB and
complete legacy GPU JSON responses at 16 MiB. `Server-Timing` separates the
Beam response-header wait from body transfer. See the dated
[pipeline investigation](docs/pipeline-latency.md) for measurements and limits.

```json
{
  "image_data": "<base64 image>",
  "format": "png",
  "return_mask": true,
  "resize_options": { "max_width": 1400, "max_height": 1400 }
}
```

Supabase sessions can also call that endpoint. API keys and sessions can read
`GET /api/v1/stats` and `GET /api/v1/activity` for their owner. Account management
requires a session: `GET|POST /api/v1/keys`,
`DELETE /api/v1/keys/:id`, and `DELETE /api/v1/account`.
`GET /health` is public. There is no unauthenticated GPU endpoint.

Normal processing reserves a free or bulk credit atomically, records usage,
and refunds a failed processing attempt. Payment collection is unfinished;
`POST /api/v1/billing/upgrade` returns 501 and never grants unpaid credits.

## GPU model

The worker uses [BiRefNet HR matting](https://huggingface.co/ZhengPeng7/BiRefNet_HR-matting),
whose model card declares the MIT license, pinned to revision
`5d6b6f8adcb5b417c871b1d84ceaae9871355b7f`. It replaces the restricted BRIA model.
The [source license](workers/background-removal/BiRefNet-LICENSE) is included.
Model licensing does not make GPU hosting free. No superiority over BRIA is
claimed without comparison on representative images.

Static outputs support PNG, WebP, GIF, and JPEG. JPEG composites against white;
PNG/WebP preserve soft alpha. Animated inputs produce GIFs, with a maximum of
60 frames and 60 million total frame pixels. Images are limited to 10 MB and
25 megapixels; output dimensions are capped at 8192 per side and 25 megapixels.
The old quality names remain accepted aliases of the same matting model.

Long-running jobs, object storage, idempotency, billing checkout, further
media operations, and agent client packages remain future work. The current
synchronous endpoint is documented with its failure limits in the migration guide.

### SDKs

Node.js and Python clients provide file input and decoded image output through
the shared HTTP API. See [source installation and usage](docs/sdks.md).
