# Production checkpoint rollout

Deployed and verified on 14 October 2026. This page records the original v10 rollout of a checkpoint captured after model loading and one dummy inference, with `keep_warm_seconds=60` and scale-to-zero. The later [CPU comparison and production decision](beam-one-core-rollout.md) selects one-core v11 with the same 8 GiB RAM and checkpoint strategy. That report contains the latest API deployment versions and the initial rollback history. V10 promoted the configuration measured in the [checkpoint comparison](beam-checkpoint-comparison.md).

The warmup loader lives in `workers/background-removal/app.py`; the experiment imports the same loader. It initializes inference at the model's existing 2048×2048 input size, transfers the result to CPU to finish GPU work, then releases unused activation allocations before capture. Requests still use the same pinned BiRefNet model and image-processing function.

## Deployed versions

| Component | Version |
| --- | --- |
| Beam app | `bg-removal` v10 |
| Beam deployment | `69afce53-7a54-4af5-8e31-5b99546d1a80` |
| Beam stub | `26194de2-1f94-4dfb-8e5f-c6e92e2a1662` |
| Beam URL | `https://bg-removal-f6823e6-v10.app.beam.cloud` |
| Cloudflare API version | `d42e1bb7-ae82-49f9-8942-4ae8f7caee9a` |
| Cloud Run compatibility revision | `openbgremover-00039-f5f` |

Both APIs pointed to v10 at this rollout. The previous non-checkpoint v9 deployment was stopped after the new version passed the production end-to-end test. No database, login, or frontend deployment change was required. The Beam SDK's existing zero-minimum, one-maximum-container defaults were retained.

The snapshot was prepared and tested before customer traffic switched. Its 1.67 GiB archive captured successfully; the direct preparation request took 60.898 seconds including capture/upload and its first image. This one-time setup is excluded from the cold-restore measurements below.

## Production verification

The real Cloudflare API passed login, signup credits, API-key creation/listing/revocation, scope enforcement, CUDA image and mask output, charging exactly one credit, rejecting invalid input, refunding a real worker failure, usage recording, and account cleanup.

Two later requests each followed a Beam container listing proving natural scale-to-zero. Each cold request was followed by three sequential warm requests through the public production API. The timer includes the complete response body.

| Measurement | Result |
| --- | --- |
| Cold full-image response, two samples | **6.111s, 5.991s** |
| Warm full-image response, six samples | **2.558s median**, 2.000–2.676s range |
| Beam checkpoint restore, lifecycle logs | 3.524s, 3.419s |
| First-image processing inside restored workers | 0.637s, 0.629s |
| Website multipart upload route, warm smoke check | HTTP 200, 4.071s |
| Legacy Cloud Run API, warm smoke check | HTTP 200, 3.315s |

All eight latency-test images and both route checks matched the reference 499,201-byte PNG, SHA-256 `a3c3ac706e7c88abb7e87b9b82408639014520c8fb3d796cf684fc43df58d25c`. The preflight also matched that image and returned the requested grayscale mask. RGBA output retained an alpha range of 0–255. Lifecycle logs show one initial inference warmup, successful checkpoint capture and two subsequent restores, rather than repeating model initialization on each cold request.

Final live state confirmed that only v10 remained active and no GPU containers were running after the idle window. Both temporary test accounts were deleted and auth deletion was verified. Local validation passed strict TypeScript, Oxlint, 13 API tests, five image-pipeline tests, Python compilation and `git diff --check`.

These are rollout checks with the same 512×512 static image used in the comparison, not a latency SLA or a broad model-quality/concurrency test. No browser click-through test was performed; the website's deployed multipart upload route was exercised directly.

## Future rollout procedure

1. Deploy `app.py:remove_background` from `workers/background-removal` using the project's `.venv/bin/beam` CLI. Keep the checkpoint flag, warmed loader and 60-second policy together.
2. Call the new version directly with an authenticated test image. Verify output and successful checkpoint capture in its lifecycle logs before updating customer-facing APIs. Snapshot preparation can take substantially longer than restore.
3. Update `BEAM_ENDPOINT_URL` in `apps/api/wrangler.jsonc`, regenerate Worker types and deploy the Cloudflare API. Do not update the retired Cloud Run service; see [the Cloud Run mistake](libvips-and-cutout-rollout-2026-10-19.md#mistake-trying-to-update-the-legacy-cloud-run-service).
4. Run `npm run test:e2e`, then the latency runner with the new stub ID. Confirm zero containers before labeling a request cold, inspect restore logs and test the website upload route.
5. Stop the replaced Beam deployment after verification. Keep its deployment record for rollback; do not delete cached model files as part of deployment cleanup.

The historical v10-to-v9 rollback used deployment `3d8265d0-85de-4cc2-8b72-b346202956a3`, whose v9 endpoint has the 60-second window but no checkpoints. To revert current one-core production, restart v10 deployment `69afce53-7a54-4af5-8e31-5b99546d1a80`, verify its output, and switch the Cloudflare API to its endpoint. The [historical v11-to-v10 rollback](beam-one-core-rollout.md#evidence-and-historical-rollback) preserves the warmed checkpoint strategy.

Ignored local evidence is under `artifacts/deployments/checkpoint-v10/`: preflight image/mask and report, `e2e-report.json`, `latency/report.json`, `summary.json`, Beam logs/task records, route checks and final deployment/container state.
