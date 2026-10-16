# Website image tools rollout — 15 October 2026

Compression and conversion, server-owned defaults, and optional Advanced
settings are live at https://openbgremover.dev.

## Deployment

- Validated preview: `dpl_5fhk7HdWw6yzGSNf8oyFXSP4Uatm`.
- Production: `dpl_BRAwVXzAtLVAmpbgnrvEKXBF7aZX`, READY, with
  `openbgremover.dev` assigned and no alias error.
- Previous production retained: `dpl_71GXCajJa1SVuSyeKgwMSxhDUfYX`.
- Vercel's direct promotion endpoint returned 422. The CLI promotion created
  a production rebuild from the validated preview's 164 uploaded source files.
  That build passed and was checked again on the production domain.
- The first preview build exposed a missing workspace dependency: website
  tests import Vitest, while Vercel's workspace install did not include the root
  development dependency. Added the existing pinned Vitest 5.0.4 to the web
  workspace and updated the lockfile. The corrected preview and production
  builds passed.

The API and CPU/GPU processing deployments were not replaced. The exact preview
origin was temporarily added to the API's CORS allowlist for browser testing.
It was removed afterwards, preserving all other bindings. Readback and OPTIONS
requests confirmed production remained allowed and the preview was no longer
allowed. No deployment protection settings were changed.

## Verification

`IMAGE_TEST_PYTHON="$PWD/.venv/bin/python" npm run check` passed: 72 tests,
strict TypeScript checking, and lint. Vercel completed the website production
build. `git diff --check` passed.

Browser checks used a disposable account and the existing 512 × 512 PNG fixture
(773.0 KiB), with real requests to the production API.

| Surface | Action | Result |
| --- | --- | --- |
| Preview | Sign in through website | Dashboard loaded; session reached upload UI |
| Preview | Compress PNG, untouched defaults | 417.1 KiB; 46% smaller |
| Preview | Download compressed PNG | Saved and decoded as 512 × 512 PNG |
| Preview | Convert to lossless WebP, effort 60 | 335.9 KiB; `.webp` download; override retained with Advanced closed |
| Preview | Reset settings, select JPEG | Quality cleared; JPEG transparency guidance visible |
| Preview | Convert to JPEG, quality 72 | 39.7 KiB; `.jpeg` download |
| Preview | Convert truncated PNG | Clear validation error; controls recovered; credit refunded |
| Production | Sign in through website | Dashboard loaded |
| Production | Compress PNG, untouched defaults | 417.1 KiB; `.png` download link |
| Production | Convert to WebP, untouched defaults | 34.1 KiB; `.webp` download link |
| Production HTTP | Existing `/api/trial/run` with PNG input | 200, image/png, 499,599 bytes; decoded 512 × 512 RGBA with alpha range 0–255 |

The account started with 50 credits. Preview finished at 47 credits, with four
calls and three successful images. Production added two successes, finishing
at 45 credits, six calls, and five successful images. The failed conversion
therefore incurred no credit charge. The public background-removal trial was
checked separately from this account.

These are desktop functional checks on one fixture, not a representative
quality, latency, or mobile-browser benchmark. Earlier implementation and SDK
verification is recorded in [the UI verification notes](image-processing-ui-2026-10-15.md).
SDK packages were not published by this website rollout.

## Cleanup and evidence

Deleted the disposable account through the API and verified Supabase returned
404. Removed its credential file and the pulled preview environment file.
Deleted the validated preview and two failed temporary deployments; all three
returned 404 on readback. Kept the live production deployment and prior rollback
deployment. Closed the browser test tabs.

Ignored evidence is in `artifacts/implementation/website-rollout/`: build and
check logs, source hashes, sanitized accounting snapshots, downloaded PNG,
trial output, and `production.png`. The workspace changes remain uncommitted.
