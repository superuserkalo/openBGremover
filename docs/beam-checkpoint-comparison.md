# Beam: 60-second warm window and controlled cold-start comparison

Measured 14 October 2026. Production now uses `bg-removal` v9 with `keep_warm_seconds=60`. Both the Cloudflare API and the legacy Cloud Run API point to it. The replaced v8 deployment was stopped. Production checkpointing remains disabled; checkpoint results below came from temporary deployments.

The strongest tested configuration was a checkpoint captured after one dummy inference: **6.20 seconds median from cold**, compared with **24.16 seconds without checkpoints**. Its best result was **5.02 seconds**. This is close to five seconds, but does not establish reliable five-second responses.

## Complete image response times

Each variant had three independently confirmed scale-to-zero cold starts, each followed by three sequential warm requests. Times include receipt of the entire API response body.

| Variant | Cold samples | Cold median | Cold range | Warm samples | Warm median | Warm range |
| --- | --- | ---: | --- | ---: | ---: | --- |
| Checkpoint off | 26.187s, 24.161s, 15.371s | 24.161s | 15.371–26.187s | 9 | 2.465s | 1.753–3.681s |
| Checkpoint after model loading | 7.402s, 5.613s, 7.701s | 7.402s | 5.613–7.701s | 9 | 2.854s | 2.077–4.037s |
| Checkpoint after model loading and dummy inference | 6.361s, 6.200s, 5.019s | 6.200s | 5.019–6.361s | 9 | 2.655s | 2.122–3.080s |

All 36 measured requests returned HTTP 200. Every output was the same 499,201-byte PNG, SHA-256 `a3c3ac706e7c88abb7e87b9b82408639014520c8fb3d796cf684fc43df58d25c`. No failed image request was discarded. One preliminary API-account setup stalled before any image request; its temporary account was removed and that setup was excluded.

The 74% reduction between the off and warmed-checkpoint cold medians is descriptive of these samples. Three cold starts per variant do not establish a percentile, reliability guarantee, or general quality benchmark.

## Where the time goes

| Cold-path measurement, median | Off | Checkpoint | Warmed checkpoint |
| --- | ---: | ---: | ---: |
| Complete client response | 24.161s | 7.402s | 6.200s |
| Time inside Cloudflare API | 23.875s | 6.784s | 5.546s |
| Cloudflare → Beam → decoded response | 23.641s | 6.615s | 5.317s |
| Beam task accepted → execution started | 18.617s | 2.481s | 3.106s |
| Image handler, including decode/resize/inference/encode | 2.338s | 1.782s | 0.726s |
| Model inference and output transfer to CPU | 1.838s | 1.349s | 0.237s |

These are nested measurements, not additive rows. Medians are calculated independently. Beam's accepted-to-started interval includes readiness and dispatch; it does not isolate GPU provisioning from routing.

Without checkpoints, imports took **6.709–14.433s**, and model loading took **2.840–3.828s**. Initialization dominated the cold path. Warm model inference took a median **0.225s**, with the complete warm handler at **0.542s**. Changing the model is not the first latency optimization indicated by these measurements.

The ordinary snapshot restored in **1.792–2.751s**. Warming inference before capture reduced the first image's inference cost, but grew the archive from **1.03 GiB to 1.67 GiB**; restores then took **2.466–3.268s**. The warmed variant still improved the measured cold median by 1.20s, but its range overlaps the ordinary checkpoint's range. More samples would be needed to quantify that incremental advantage confidently.

For the warmed variant, median time outside the Beam round trip was about **0.64s** in total: **0.25s** inside the API for authentication, database work, validation and serialization, and **0.39s** outside that API handler. The remaining Beam overhead beyond accepted-to-started and image processing was a median **1.14s**, combining transport, dispatch and response handling. These timers cannot split that remainder further.

Each request records client start, API arrival, API elapsed time, Beam round trip, full-body completion and its output hash. GPU logs record imports, model readiness, request entry, inference start/end and handler completion with task IDs. Task records tie each group of four requests to a distinct container. Some GPU host clocks differed from the client/control-plane clock by roughly 17 seconds. Cross-machine wall timestamps were therefore not subtracted to invent a precise arrival-to-readiness interval; duration measurements and same-control-plane task timestamps were used instead.

## Method and limits

- Same temporary Cloudflare Worker URL and `/api/v1/remove-background` route for all variants. Only its configured Beam endpoint changed between batches. The wrapper calls the real production handler and adds timing response headers.
- Real Supabase login, API key authentication, credit reservation and usage recording. Each batch's temporary account, keys and rows were removed; auth deletion was verified with HTTP 404.
- Same 512×512 astronaut PNG, 791,555 bytes; model preprocessing remains 2048×2048. RTX 4090, two Beam CPU cores, 8 GiB RAM, FP16, 60-second keep-warm window, zero minimum and one maximum container for each test deployment.
- Same persistent model cache, pinned BiRefNet HR-matting revision `5d6b6f8adcb5b417c871b1d84ceaae9871355b7f`, dependency image and image-processing function.
- All image test calls ran sequentially. Every cold sample followed a container listing showing zero containers; no forced container stop manufactured a cold sample. Variants ran in order off, checkpoint, warmed checkpoint; this was not randomized, and physical GPU hosts were not pinned.
- Checkpoint capture was completed before measuring restores. Initial capture plus first image took **42.727s** for the ordinary checkpoint and **47.633s** for the warmed checkpoint, measured directly against Beam and excluded from the API comparison. A rollout using checkpoints should prepare its snapshot before switching customer traffic.
- These results cover cached model files and available capacity, one static image and no concurrent load. Empty caches, other inputs, capacity shortages and sustained traffic were not measured.

Beam documents checkpoint support as runtime/workload-dependent and recommends checking lifecycle logs. Capture and all six measured restores succeeded here. [Beam cold-start guidance](https://docs.beam.cloud/v2/topics/cold-start).

## Production and cost

Production deployment: `3d8265d0-85de-4cc2-8b72-b346202956a3`, stub `a3d4f0a7-459a-4bf0-ad5f-696e356371fe`, URL `https://bg-removal-f6823e6-v9.app.beam.cloud`. Cloudflare version `6fd23e30-f889-40f5-ba13-dbcaf22245d1`; Cloud Run revision `openbgremover-00038-7p8`. No always-running GPU minimum was introduced. The three temporary Beam deployments were stopped, the temporary Cloudflare API was deleted, and all four temporary benchmark identities (including the preliminary setup failure) were confirmed absent. Only production v9 remains active.

At published rates, this allocation is `$0.000192 + 2 × $0.000105 + 8 × $0.0000055 = $0.000446/second`. A configured 60-second idle tail models **$0.02676 per isolated burst**, versus **$0.13380** for 300 seconds: an **80% reduction in that idle component**, not an 80% reduction in every invoice. Startup, processing and actual shutdown timing add to it. [Beam pricing](https://www.beam.cloud/pricing), [keep-warm behavior](https://docs.beam.cloud/v2/endpoint/keep-warm).

The production API end-to-end test passed login, API-key creation/revocation, real GPU processing, credit charging, failed-request refunds and account cleanup. Separate website and legacy Cloud Run image requests also returned the expected PNG. Local validation passed strict TypeScript, Oxlint, 13 API tests, five image-pipeline tests and `git diff --check`.

Checkpointing is the next supported latency improvement from this experiment. A warmed checkpoint is a promising candidate for roughly 5–7-second cold responses on this workload, subject to further sampling. Neither an asynchronous job API nor a GUI warmup would remove the measured startup work for an unsolicited API request. This task deployed the requested 60-second policy and kept checkpoint experiments separate from production.

## Reproduction and evidence

The GPU variants are in `workers/background-removal/benchmark_checkpoint.py`: `control_benchmark`, `checkpoint_benchmark`, and `warmed_checkpoint_benchmark`. Deploy from that directory with `.venv`'s Beam CLI. Initialize each checkpoint once before starting its measured restore batch.

Create a temporary Wrangler config from `apps/api/wrangler.jsonc`, with a unique worker name, `main` pointing to `apps/api/scripts/benchmark-worker.ts`, and a separate rate-limit namespace. Keep the same Hyperdrive, auth and other bindings. Deploy it using the ignored `apps/api/.dev.vars` secrets file; change only `BEAM_ENDPOINT_URL` between completed batches. Never switch production back and forth for the benchmark.

Run from the repository root, using the temporary API URL and the appropriate test stub:

```sh
E2E_API_URL=https://YOUR-TEMPORARY-API.workers.dev \
BENCHMARK_STUB_ID=YOUR-TEST-STUB \
BENCHMARK_OUTPUT=artifacts/benchmarks/your-variant \
BENCHMARK_CYCLES=3 BENCHMARK_WARM_REQUESTS=3 \
  node --env-file=.env.deployment apps/api/scripts/benchmark.ts
```

The runner waits for natural scale-to-zero and cleans up its temporary identity. Stop all test Beam deployments and delete the temporary Cloudflare Worker after collecting logs.

Local artifacts, ignored by Git, are under `artifacts/benchmarks/controlled/`: `off-retry/`, `on/`, and `warmed/` each contain `report.json`, `beam-tasks.json`, `beam-logs.jsonl` and `output.png`. `summary.json` contains correlated phase measurements. Initialization reports/logs, production route checks and deployment cleanup records are stored alongside them. The original comparison remains in [the historical report](beam-benchmark.md).
