# Image tools website verification — 15 October 2026

Compression and conversion are wired into the existing shared website upload
component and playground. Uploads preserve original bytes and use the central
authenticated API. No browser-side resizing or separate processing service was
added. Background removal retains its existing public trial flow.

## Local checks

- `npm run check`: passed; 64 tests passed, one opt-in Python test skipped.
- `npm run build:web`: passed.
- New request/response tests cover original bytes, per-format settings, size
  bounds, response format/operation checks, and incomplete downloads.
- Downloaded files were recognized as JPEG, PNG, and WebP. JPEG and PNG
  downloads retained the fixture's 512 × 512 dimensions.

## Browser against the production API

The local production build at `http://localhost:3000` used the deployed API at
`https://openbg-api.gantchevkaloyan.workers.dev`. A disposable account started
with 50 credits. The input was the existing 512 × 512 PNG fixture (773.0 KiB).

| Action | Result |
| --- | --- |
| Signed-out conversion | Disabled with sign-in links; selected file retained when signing in through another tab |
| Convert to WebP, quality 80 | Preview and download; 34.1 KiB, 96% smaller |
| Convert to JPEG, quality 80 | Preview and download; 47.4 KiB, 94% smaller |
| Convert to PNG, level 6 | Preview and download; 417.1 KiB, 46% smaller |
| Compress PNG, level 6 | Preview; 417.1 KiB, 46% smaller |
| Submit truncated PNG | Visible validation error; controls became usable again |

Changing format or operation cleared the previous result and updated the
relevant controls. Account statistics showed five calls, four successful
images, and 46 remaining credits. Activity recorded four successes and one
failure, confirming the failed request's reservation was refunded.

The account was deleted through `DELETE /api/v1/account` (200), then verified
absent through the Supabase admin API (404). Its local credential file was
removed. Browser test tabs were closed.

These are functional checks on one fixture, not a representative quality or
latency benchmark. Desktop behavior was inspected; mobile layout was not
verified because the browser viewport override did not change the viewport.
The website was not deployed during this work.

Ignored logs, downloads, a desktop screenshot, sanitized accounting results,
and cleanup confirmation are under `artifacts/implementation/image-ui/`.

## Follow-up: defaults and SDK parity

The website now omits untouched encoding settings and places overrides under
collapsed Advanced settings. Conversion format remains visible. Reset clears
all overrides; closing the section preserves them. Lossless WebP exposes quality
as compression effort. Both Node.js and Python clients now expose compression
and conversion with all three optional encoding fields. Python background
removal also omits defaults and exposes the existing resize options.

The API and CPU worker already supported these defaults and overrides; their
production implementation did not need to change. API tests now explicitly
verify omission and forwarding, and Pillow tests verify server defaults against
explicit settings. Project instructions record this convention for new work.

Verification after this follow-up:

- `IMAGE_TEST_PYTHON="$PWD/.venv/bin/python" npm run check`: 72 tests passed,
  including the real Pillow/API/accounting test; strict typing and lint passed.
- Website production build and Node SDK build passed.
- Python SDK: nine tests passed against a local HTTP server. CPU image pipeline:
  12 tests passed. CI now includes the SDK build and Python SDK tests.
- Desktop browser: Advanced settings starts collapsed; opening it leaves
  overrides unset; lossless WebP changes the quality label to compression
  effort; reset clears overrides; explicit PNG level zero survives closing and
  reopening the section; JPEG transparency guidance remains visible.
- The opt-in live API runner passed with image operations enabled: nine
  successful charges, invalid-request rejection, worker failure refunds, key
  revocation, and verified account cleanup.
- A separate live SDK check completed compression and conversion from each
  SDK, verified applied overrides, and recorded four successes/four credits.
  Its disposable account was deleted and verified absent. An earlier failed
  attempt also cleaned up its account.

The live Python check initially received Cloudflare HTTP 403/error 1010 with
urllib's default user-agent. Public health checks returned 403 for that default
and 200 for `openbg-py/0.1.0`. The SDK now identifies itself explicitly; the
subsequent authenticated compression/conversion checks passed.

Follow-up evidence is under `artifacts/implementation/image-defaults/`. No
website deployment or SDK package publication was performed. Browser checks
were desktop only; they exercised settings rather than another paid upload.
