# Image compression and conversion production rollout

Deployed on 15 October 2026 after explicit authorization. JPEG, PNG, and WebP
compression and conversion are live through the existing authenticated API.
The temporary deployment passed before production promotion. No database
migration, frontend deployment, or background-removal endpoint change was made.

## Production versions

| Component | Verified version |
| --- | --- |
| API | `https://openbg-api.gantchevkaloyan.workers.dev` |
| Cloudflare version | `af68de2c-6783-44b8-91b2-09b4d0493aed` |
| CPU endpoint | `https://image-processing-e41046c-v1.app.beam.cloud` |
| Beam deployment | `b3f345e8-bb93-4ace-a383-aef84948a2e5` (`image-processing` v1) |
| Beam stub | `626c726a-814d-4ddb-ba6b-d0398b2083b8` |
| Dependency image | `07dcbfffe9261564`, Pillow `12.3.0`, Python `3.12` |
| Existing GPU endpoint | `https://app.beam.cloud/endpoint/bg-removal/v18` (unchanged) |

Live Beam configuration readback confirmed one CPU core, 8 GiB RAM, no GPU,
authentication required, zero retries, a 60-second task timeout and idle window,
and minimum zero / maximum one container. The CPU worker does not use a model
checkpoint. Production retains every pre-existing API binding; the only added
binding is `IMAGE_PROCESSING_ENDPOINT_URL`. Hyperdrive query caching is disabled.

## Verification

The temporary API (`openbg-image-test-20261015`, version
`8fa436b2-9485-41cf-ae75-f97d1df4f7c2`) and CPU deployment
`df3a6bd2-5fb3-44c0-b368-2d161d2f2a84` passed the opt-in live suite. Production
then passed the same suite. Each run verified:

- Supabase login, JWT authentication, signup credits, API-key creation and scope.
- Existing GPU background removal with mask, binary output, and JSON output.
- CPU conversion to JPEG, PNG, and WebP, followed by raw binary compression of
  each format. Compression never increased output size.
- Exactly nine successful charges and corresponding usage records.
- Invalid-option rejection, real CPU/GPU decoder failures, refunds, and exactly
  two failed usage records without net credit loss.
- Immediate API-key revocation and deletion of the disposable test account,
  confirmed by Supabase returning 404 afterward.

All saved output images decoded at the expected 512 × 512 dimensions. The six
production CPU output files were byte-identical to their temporary-deployment
counterparts. A separate direct production CPU preflight rejected an
unauthenticated request and preserved every RGBA byte in a 256 × 256 lossless
WebP conversion, including soft alpha and RGB beneath transparent pixels.

The initial temporary API health probe returned HTTP 500 immediately after
deployment, before any identity or processing request was created. A subsequent
probe returned 200 with no runtime exception. The full test was started after
readiness and passed; no failed paid request was retried. Production readiness
and the production suite passed on their first runs.

Local implementation checks had passed strict TypeScript, Oxlint, all 60
TypeScript tests (including real-Pillow/PGlite integration), 11 CPU image tests,
and nine background-image tests. The production URL change regenerated Worker
types and passed the API dry-run build. These checks and the small live fixture
set establish rollout correctness, not broad image-quality, concurrency, or
latency guarantees. No browser interaction or cost benchmark was run here.

## Cleanup and recovery

The temporary Cloudflare Worker was deleted; a subsequent control-plane read
returned error 10007, “This Worker does not exist on your account.” The temporary
Beam deployment was deleted and was absent from the subsequent deployment list.
Only the existing background-removal v18 and production image-processing v1
deployments remained active. Both disposable accounts were removed by the live
runner. The temporary local secrets copy was deleted.
The final Beam container inventory was empty, confirming natural scale-to-zero
after the idle window without stopping either production deployment.

The prior API version is `34ec2d7f-4985-4277-b73e-9e36e58ca37d`. If a rollback is
needed, restore that version and verify background removal and accounting before
stopping the CPU deployment. Alternatively, an API deployment with an empty
`IMAGE_PROCESSING_ENDPOINT_URL` disables the two new routes before credit
reservation. Neither operation has a durable idempotency guarantee; do not
automatically retry paid requests.

Ignored evidence is under `artifacts/deployments/image-processing-2026-10-15/`:
temporary/production E2E reports and images, image checksums, direct alpha
preflight, configuration readbacks, deployment logs, and cleanup checks. Private
logs may contain provider credentials or transport metadata and must not be
published. Request options and limits are in [the API guide](image-processing.md).
