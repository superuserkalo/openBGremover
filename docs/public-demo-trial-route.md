# Public demo trial route

21 October 2026.

## Problem

Signed-out visitors could try background removal in the playground, but
compression and conversion showed "Sign in to compress images". Those are the
cheapest operations to run, so gating them behind an account blocked the
easiest way to try the product. The website's trial proxy also lived at
`/api/trial/run` and could only call background removal, so every new
operation would have needed its own proxy.

## Change

- **One trial route for every operation.** The website serves
  `/api/trial/[operation]`, where `operation` is any `MediaOperation` from
  `packages/contracts` (`remove-background`, `compress-image`,
  `convert-image`). Unknown operations return 404. Future operations join by
  being added to `MediaOperation` and given a request decoder in the route.
- **The trial key stays on the server.** The route adds
  `TRIAL_INTERNAL_API_KEY` and `X-Usage-Context: trial` and forwards to the
  matching `/api/v1/<operation>` route. The key still cannot manage keys or
  accounts, and trial requests are never charged.
- **Request bodies.** Background removal keeps accepting multipart, raw image,
  or JSON. Compression and conversion accept the same JSON as the public API,
  decoded with `CompressImageRequest` / `ConvertImageRequest` (excess
  properties rejected) before forwarding. The API still validates everything
  again before processing.
- **Separate rate limits.** Background removal keeps `TRIAL_LIMITER`, 5
  requests a minute. Compression and conversion use `TRIAL_IMAGE_LIMITER`, 30 a
  minute, so cheap CPU demos cannot use up the GPU demo's budget. Invalid
  input is rejected before the limiter counts it.
- **Playground.** Signed-in visitors keep calling the API with their session
  and credits, so their usage history stays complete. Signed-out visitors go
  through the trial route. The sign-in prompt is gone; the option hint now
  lists AVIF and HEIC and says the demo is free without an account.

## Tradeoff

30 a minute was chosen because one compression or conversion takes about a
second of one CPU core and costs a fraction of a cent, so the cap stops scripted
abuse without normal visitors reaching it. It is a judgement, not a
measurement of demo traffic.

## Known weakness: the limit is shared, not per visitor

Both limiters use one key, `public-demo`, so each budget is shared by every
signed-out visitor at a Cloudflare location. One visitor, or one script, can
use the whole minute's budget, and everyone else then sees "The demo is busy".
Cloudflare's limiter is also approximate and counts per location, so it is not
a global spend cap.

This was already true for background removal. This change keeps the same
design for compression and conversion rather than solving it here.

**To review:** [Public demo rate limit is shared by all signed-out
visitors](https://github.com/superuserkalo/openBGremover/issues/16). It covers a
per-visitor limit alongside the shared cap, whether the shared caps remain as a
spend ceiling, behaviour across locations, and whether the demo needs a
captcha. Revisit when the demo shows 429s in normal use, or when trial traffic
shows up in costs.

## Verification

See the commit and rollout notes for the deployed versions. Local checks:
strict TypeScript, Oxlint, the API test suite (including trial compression and
conversion: allowed, rate-limited per operation, invalid input rejected before
the limiter, no credit charged, account routes refused), and the website
build.
