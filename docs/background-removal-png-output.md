# Background-removal PNG output: transparent pixels and the size fallback

19 October 2026. Deployed the same day as background removal v20, together with
the previously unpromoted imagecodecs candidate in
[the PNG encoding validation](png-encoding-browser-validation.md). Verification
is in [the rollout record](libvips-and-cutout-rollout-2026-10-19.md).

## Problem

Two problems surfaced while measuring
[how Pillow and libvips share one pipeline](https://github.com/superuserkalo/openBGremover/issues/15):

- **Large photo cutouts exceed the 12 MiB result limit.** The worker kept the
  original RGB samples under fully transparent pixels, so the removed
  background was still stored in the file. Anyone could recover it by discarding
  alpha. It also set the file size: a 12 MP photo cutout was about 18 MiB at
  every lossless PNG level, so the worker rejected it after inference had run.
- **The size fallback and JSON/mask path were slow.** They used Pillow PNG at
  level 6, which took 6.7 s for a 12 MP RGBA image on the one-core Beam
  allocation.

## Change

- After compositing and resizing, the worker sets RGB to zero wherever alpha is
  exactly zero. Soft alpha, partially transparent pixels and every visible pixel
  are unchanged. This applies to every output format. Lossy WebP was already
  free to rewrite these samples, because libwebp fills them from visible
  neighbours.
- PNG output for RGBA images and masks goes through `imagecodecs` (libpng).
  The binary path tries level 3 with UP filtering first. Above 12 MiB, and for
  JSON responses and masks, it uses level 6 with adaptive filtering. Both are
  lossless.
- The ICC profile is written as the same `iCCP` chunk Pillow writes. Pillow
  writes no EXIF to PNG unless asked, so images with EXIF now take the faster
  path with identical output metadata. Images whose info carries a
  `transparency` key still use Pillow.

## Evidence

**Beam, one CPU core**, 12 MP RGBA proxy (photo with a radial alpha gradient),
from the #15 benchmark:

| Encoder | Time | Size |
| --- | --- | --- |
| Pillow level 6 | 6.7 s | 19,109,286 B |
| imagecodecs level 6, adaptive filtering | 1.6 s | 19,095,561 B |

Both decode to identical RGBA.

**Local Mac**, 4000 × 3000 JPEG, with an elliptical subject covering half the
frame and a 40 px soft edge, measured through `process_image`:

| Path | Before | After |
| --- | --- | --- |
| Binary PNG | 18.19 MiB (rejected) | 10.29 MiB |
| JSON PNG with mask | 18.19 MiB | 10.00 MiB |
| Binary WebP | 0.65 MiB | 0.61 MiB |

Alpha matched the mask exactly in every case. With subjects covering 30%, 50%
and 80% of the frame, level-3 PNG was 6.66, 10.29 and 15.48 MiB. A subject
filling most of a 12 MP frame can therefore still exceed the limit. That request
returns the existing error, and the API refunds the credit.

## Tradeoff and when to revisit

The only pixels that change are ones no viewer shows. A caller that relied on
recovering the original background from a PNG cutout loses that; they should
request the mask and keep their source image.

Revisit the limit if near-full-frame 12 MP cutouts become a common failure. The
options then are a larger result limit, which affects the API, website reader
and Beam response bounds, or lossless WebP as the suggested format for large
cutouts.
