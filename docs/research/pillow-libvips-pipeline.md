# How Pillow and libvips work together in one image pipeline

Researched 16 October 2026 for issue #15 (part of map #2). This review uses
primary sources and a small local measurement. Nothing was deployed, and no GPU
request or production traffic was involved. No dependency or lockfile changed.

**Working decision under test:** libvips (pyvips + `pyvips-binary`) handles
decoding, resize, palette reduction, and encoding: MozJPEG, libpng with
`filter=all`, libwebp, aom AVIF, and cgif GIF. Pillow + pillow-heif only decode
HEIC input. The background-removal GPU worker keeps its existing Pillow use.
Related research: [image formats and encoders](https://github.com/superuserkalo/openBGremover/blob/research/image-formats-encoders/docs/research/image-formats-encoders.md)
(#11) and [license matrix](https://github.com/superuserkalo/openBGremover/blob/research/license-matrix/docs/research/license-matrix.md)
(#10). The CPU worker currently uses Pillow only; see
`workers/image-processing/imaging.py` in the working tree. That file and the
benchmark doc are not yet on `master`.

## Answer

1. **Hand off from pillow-heif's standalone API straight to pyvips. Skip the
   Pillow `Image` entirely.** `pillow_heif.open_heif()` exposes the decoded
   primary image as a contiguous `memoryview`. Passing it to
   `pyvips.Image.new_from_memory(...)` wraps that memory without copying. pyvips
   keeps a reference, so the buffer outlives the vips image. At 12 MP this
   handoff took **0.1 ms**. The Pillow plugin route plus `tobytes()` or
   `np.asarray()` took 9–13 ms; a TIFF round-trip took 32–37 ms. Peak RSS was
   about 41 MiB and 99 MiB higher, respectively. NumPy is not needed on this
   path, which avoids a ~180 ms import.
2. **Do not forward HEIC EXIF to libvips, and never `autorot()` a HEIC-decoded
   image.** libheif already applies `irot`/`imir`, but pillow-heif's
   standalone API keeps the original EXIF orientation. Forwarding that EXIF made
   `autorot()` rotate the image a second time in the probe. The Pillow plugin
   resets orientation to 1. The standalone API leaves that to the caller.
3. **Carry color explicitly.** Attach `info["icc_profile"]` as vips
   `icc-profile-data`. If the file has only an `nclx` profile, map BT.709/sRGB
   to sRGB and Display P3/sRGB-transfer to libvips' built-in `p3` profile.
   Reject PQ/HLG transfer until an HDR policy exists. Treat files with no color
   information as sRGB.
4. **10/12-bit HEIC must bypass Pillow.** The Pillow plugin always converts to
   8-bit. The standalone API with `convert_hdr_to_8bit=False` returns `RGB;16`
   data. libvips handles it as `ushort`/`rgb16`. `colourspace("srgb")` produced
   8-bit pixels **byte-identical** to pillow-heif's own 8-bit conversion. A
   later 16-bit PNG output can therefore reuse the same path.
5. **Process only the primary image. Report the top-level image count.** Burst
   files are `image/heif-sequence`; iPhone spatial photos are stereo pairs.
   Depth maps, HDR gain maps, and thumbnails are decoded only when requested.
   pillow-heif 1.8.1 has no API for track-based sequences. Output is the SDR
   base image.
6. **Enforce the 25 MP limit after `open_heif()` and before `.data`.** libheif's
   default limit is about 1.07 gigapixels, and a 200 MP sample decoded under
   defaults. Reading the header took 7.5 ms with no RSS growth.
7. **Every libvips saver keeps all metadata by default, including EXIF.** Pass
   `keep="icc"` to preserve the current "ICC kept, EXIF dropped" contract.
   Set `subsample_mode` explicitly for JPEG: libvips turns chroma subsampling
   off at Q ≥ 90.
8. **Route AVIF encoding to Pillow (libavif), not libvips. This revises the
   working decision and keeps #11's routing, for a different reason.** For
   photographs, libvips' default AVIF output was 0–6% smaller than Pillow's at
   similar PSNR. In libheif 1.23.5, libvips' default is already `tune=iq`. On
   the text graphic, libvips was 4.2–5.2× larger at every quality setting. The
   cause is that libvips hard-disables aom's intra-block-copy screen-content
   tool. Pillow with the same switch off reproduced the size: 59,763 bytes
   versus 60,233. Handing a 12 MP RGB image back to Pillow costs about 19 ms
   (10.6 ms render plus 8.4 ms copy; RGBA maps without the copy), against an
   encode of 1 s or more.
9. **Do not move background removal onto the libvips encode path yet.** Its
   binary PNG fast path (imagecodecs level 3, `UP`) already matches libvips
   speed: 619 ms versus 647 ms at 12 MP RGBA, with pixel-exact output. The real
   waste is elsewhere: the Pillow level-6 PNG used for `return_mask` and the
   oversize fallback took **6.7 s**. imagecodecs, already installed, does it in
   **1.6 s** with essentially identical bytes (19,095,561 versus 19,109,286).
   Share the libvips path only when background removal must expose the same
   per-format options.

## Evidence setup

| Item | Value |
| --- | --- |
| Packages | Pillow 12.3.0, pillow-heif 1.8.1 (libheif 1.23.6, libde265 1.1.3, x265 4.3), pyvips 3.2.0 (API mode), pyvips-binary 8.18.7 (libvips 8.18.7), NumPy 2.5.4, imagecodecs 2026.10.10 |
| Container | `python:3.12-slim`, **linux/arm64** on Apple Silicon, `docker run --cpus=1 --memory=8g` |
| Timing label | **Relative only.** This is not Beam x86_64 latency. Medians of five in-process repetitions per case; each case ran in a fresh subprocess so peak RSS is not inherited. |
| Fixtures | 4000×3000 landscape photo (from the Pillow/libvips benchmark, `docs/pillow-libvips-benchmark-2026-10-15.md` in the working tree; CC BY-SA 3.0) re-encoded as 8-bit and 10-bit HEIC by pillow-heif/x265. 1600×1200 fixtures cover orientation, P3 ICC, 10/12-bit ramps, soft-alpha RGBA, and multi-image files. Real-world samples come from pillow-heif's `tests/images` at tag `v1.8.1`: iPhone `pug.heic`, Xiaomi, Samsung gain map, Nokia burst/alpha, spatial and stereo photos, and a 200 MP image. |
| Raw output | Ignored `artifacts/pillow-libvips-pipeline-2026-10-16/` (`probe.json`, `bench.json`, `avif.json`, logs, scripts, Dockerfile). Not in git. |

## 1. Pixel handoff

### What the sources say

- `pyvips.Image.new_from_memory(data, w, h, bands, format)` accepts any buffer.
  It calls `vips_image_new_from_memory` on `ffi.from_buffer(data)` and appends
  `data` to `image._references`, so the memory is not collected while any
  derived image lives ([pyvips 3.2.0 `vimage.py`](https://github.com/libvips/pyvips/blob/v3.2.0/pyvips/vimage.py),
  `new_from_memory`). libvips does not copy that memory
  ([libvips `image.c`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/iofuncs/image.c),
  `vips_image_new_from_memory`). The buffer must stay valid and unmodified;
  `new_from_memory_copy` exists for when it cannot.
- `new_from_array` reads `__array_interface__`. If the object has no `strides`
  and has a `.data` attribute, it passes `.data` to `new_from_memory` and shares
  memory. Otherwise it calls `tobytes()` (same file, `new_from_array`).
- pillow-heif's `HeifImage` provides both. `data` is the decoded buffer.
  `__array_interface__` derives the shape from `stride` and uses `<u2` for more
  than 8 bits ([`heif.py`](https://github.com/bigcat88/pillow_heif/blob/v1.8.1/pillow_heif/heif.py),
  lines 69–101). Standalone `open_heif` defaults to `remove_stride=True`, so
  stride equals width × bands × bytes (same file, lines 302–328). The probe
  measured stride 3600 for a 1200-pixel RGB row, with type `memoryview`.
- The Pillow plugin opens with `convert_hdr_to_8bit=True, remove_stride=False`
  and copies the result into Pillow's own storage
  ([`as_plugin.py`](https://github.com/bigcat88/pillow_heif/blob/v1.8.1/pillow_heif/as_plugin.py),
  line 47 and `load`).
- Pillow's `__array_interface__` always calls `tobytes()`, a copy
  ([Pillow 12.3.0 `Image.py`](https://github.com/python-pillow/Pillow/blob/12.3.0/src/PIL/Image.py),
  line 805). Pillow stores `RGB` at 4 bytes per pixel
  ([`Storage.c`](https://github.com/python-pillow/Pillow/blob/12.3.0/src/libImaging/Storage.c),
  lines 134–137), so packed RGB always needs a repack. `Image.frombuffer` maps
  memory without copying only for `_MAPMODES` = `L, P, RGBX, RGBA, CMYK, I;16*`
  (`Image.py` line 267). The result is read-only.

### Measured (12 MP 8-bit HEIC → vips → MozJPEG Q80, 1 CPU, relative)

| Route | Handoff ms | Decode ms | JPEG ms | Peak RSS Δ MiB (default / 1 thread) |
| --- | ---: | ---: | ---: | ---: |
| **Standalone `open_heif` → `new_from_memory(img.data)`** | **0.1** | 951 | 101 | **135 / 124** |
| Pillow plugin → `tobytes()` → `new_from_memory` | 11.8 | 955 | 114 | 176 / 166 |
| Pillow plugin → `np.asarray` → `new_from_array` | 9.1 | 956 | 107 | 177 / 165 |
| Pillow plugin → TIFF bytes → `new_from_buffer` | 36.9 | 957 | 122 | 234 / 221 |
| 10-bit HEIC, standalone, `convert_hdr_to_8bit=True` | 0.1 | 897 | 107 | 136 / 124 |
| 10-bit HEIC, standalone 16-bit → `rgb16` → `colourspace("srgb")` | 0.3 | 913 | 120 | 190 / 171 |

All 8-bit routes produced identical pixels and identical ICC bytes in the probe.
**HEVC decoding dominates.** Even the slowest handoff is under 4% of the
total. The memory difference is the larger reason to choose the standalone
route. A full-resolution 25 MP RGBA frame is 100 MB at 8 bits and 200 MB at
16 bits, so each avoided copy matters even with 8 GiB.

Reverse direction (vips → Pillow, needed for item 8 of the Answer), 12 MP:
`write_to_memory()` 10.6 ms, then `Image.frombuffer("RGB", ...)` 8.4 ms (copy),
or `frombuffer("RGBA", ...)` 0.0 ms (mapped, read-only).

## 2. Carrying metadata across the boundary

### Orientation

HEIF stores rotation and mirroring as transformative properties. libheif
applies them unless `ignore_transformations` is set ("Default: false",
[`heif_decoding.h`](https://github.com/strukturag/libheif/blob/v1.23.6/libheif/api/libheif/heif_decoding.h),
lines 69–71). pillow-heif's `set_orientation()` resets EXIF and XMP orientation
to 1. The plugin calls it automatically. Standalone callers must call it
themselves ([`misc.py`](https://github.com/bigcat88/pillow_heif/blob/v1.8.1/pillow_heif/misc.py),
lines 98–113; [`as_plugin.py`](https://github.com/bigcat88/pillow_heif/blob/v1.8.1/pillow_heif/as_plugin.py),
`_init_from_heif_file`).

The probe wrote a 1600×1200 image with EXIF orientation 6. pillow-heif stored
`irot 270` and kept EXIF 6. The decoded image was 1200×1600, correctly upright.
Standalone `info["exif"]` still said 6. Forwarding that EXIF and calling vips
`autorot()` produced **1600×1200, rotated twice**. The plugin reported
orientation 1 (`original_orientation` 6). The iPhone sample has `irot 0` and
EXIF 1.

**Rule:** HEIC pixels are already upright. Apply `autorot()` only to images
decoded by libvips. libvips removes the orientation tag after rotating
([`autorot.c`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/conversion/autorot.c)).
The current API omits EXIF anyway, so HEIC EXIF never needs to reach libvips.

### ICC and nclx

pillow-heif sets `info["icc_profile"]` (type `prof` or `rICC`) or
`info["nclx_profile"]`, never both
([`heif.py`](https://github.com/bigcat88/pillow_heif/blob/v1.8.1/pillow_heif/heif.py),
lines 40–47). Observed:

| File | Color information |
| --- | --- |
| iPhone `pug.heic` | ICC `prof`, 536 bytes |
| Samsung `aux_YCbCr.heic` | ICC `prof`, 632 bytes |
| Xiaomi `xiaomi.heic` | none |
| Files encoded by pillow-heif without ICC | nclx primaries 1, transfer 13 (BT.709 / sRGB) |
| `stereo_pair.heic` | nclx 2/2 (unspecified) |

Code points are defined in [ITU-T H.273](https://www.itu.int/rec/T-REC-H.273).
libvips has built-in `srgb`, `p3`, and `cmyk` profiles, all of which loaded in
the probe. The nclx mapping is therefore: 1/13 → sRGB (nothing to attach);
12/13 → `p3` (attach or `icc_transform`); 16 (PQ) or 18 (HLG) → reject for now;
2/unspecified or absent → sRGB. This mirrors the existing worker, which
preserves RGB ICC profiles and converts profiled CMYK and grayscale to sRGB.

A pyvips image made from memory has no metadata; the probe reported
interpretation `srgb`. Attach the profile with
`im.set_type(pyvips.GValue.blob_type, "icc-profile-data", icc)` on a `copy()`.

**Saver default:** `keep` defaults to `VIPS_FOREIGN_KEEP_ALL`
([`foreign.c`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/foreign/foreign.c),
line 1901). The probe confirmed that JPEG, PNG, and WebP keep EXIF by default.
With `keep="icc"`, they kept the exact ICC bytes and dropped EXIF. With
`keep="none"`, they dropped both.

### Alpha

pillow-heif modes ending in `A` are straight alpha; modes ending in `a` are
premultiplied (`HeifImage.premultiplied_alpha`, `heif.py` lines 245–258). A
lossless soft-alpha RGBA HEIC passed through vips to PNG with **alpha error 0**
and RGB error ≤ 1. Call `unpremultiply()` in vips for `a` modes. Note that an
alpha *auxiliary* image belongs to its colour item. The Nokia `alpha.heic`
sample has three top-level images, and only one of them is RGBA.

### Bit depth

With `convert_hdr_to_8bit=False` and the default `hdr_to_16bit=True`, 10-bit
samples are shifted left into 16 bits rather than rescaled: maximum 65,472,
with the low 6 bits always zero. 12-bit samples peak at 65,520. The mode is
`RGB;16`. With `hdr_to_16bit=False`, the raw `RGB;10`/`RGB;12` values are
exposed (maximum 1023/4095). The 10-bit ramp kept 1,024 distinct levels; the
plugin's 8-bit output had 256. `new_from_array(img, interpretation="rgb16")`
then `colourspace("srgb")` matched pillow-heif's own 8-bit downconversion
exactly for both depths. The 16-bit path costs 47–55 MiB more peak RSS at
12 MP. Use it only when a 16-bit output (PNG, later AVIF/JXL) is requested;
otherwise let pillow-heif produce 8-bit.

## 3. Multiple images, sequences, and auxiliary images

- **Top-level images.** pillow-heif lists every top-level image and the
  `primary_index`; the Pillow plugin's `n_frames` is that count
  ([`as_plugin.py`](https://github.com/bigcat88/pillow_heif/blob/v1.8.1/pillow_heif/as_plugin.py),
  line 126). The primary image is not always first: the Nokia alpha sample's
  primary index is 2. Observed: spatial photo (2 images, entity group), stereo
  pair (`ster` group), Nokia burst (4 images, mimetype `image/heif-sequence`).
  The existing rule says frames are never silently discarded. To honor it,
  decode the primary image and report the image count in metadata. Reject
  `image/heif-sequence` files rather than treat a burst as one photo. This is a
  product choice; the format defines the primary image as the one displayed.
- **Track-based sequences.** libheif 1.23 has a sequence API
  (`heif_context_has_sequence`,
  [`heif_sequences.h`](https://github.com/strukturag/libheif/blob/v1.23.6/libheif/api/libheif/heif_sequences.h)).
  pillow-heif 1.8.1 exposes nothing for it; the probe found no sequence or track
  names in either module. Track-only files are out of reach without a different
  binding. Do not offer them. Untested: no such sample was available.
- **Auxiliary images and depth.** The iPhone sample carries an Apple HDR gain
  map (`urn:com:apple:photo:2020:aux:hdrgainmap`, 2016×1512, L) and a
  768×576 depth image. The Samsung sample carries a gain map (1000×462, RGB).
  All are decoded only on `get_aux_image()` or depth access. Ignore them; the
  output is the SDR base rendition. libvips 8.18 has a `GAINMAP` keep flag and
  an UltraHDR saver, which could become a later HDR ticket. That was not
  verified here.
- **Thumbnails.** In plugin mode, `Image.draft()` (and therefore
  `Image.thumbnail()`) can decode an embedded thumbnail *instead of* the main
  image (`as_plugin.py` line 84). This is another reason to avoid the plugin.
  The standalone API never substitutes a thumbnail.

## 4. Limits, threads, memory, and latency on 1 CPU / 8 GiB

- **Pixel limit.** libheif's defaults are `max_image_size_pixels`
  32768 × 32768, `max_total_memory` 4 GB, and `max_items` 1000
  ([`security_limits.cc`](https://github.com/strukturag/libheif/blob/v1.23.6/libheif/security_limits.cc),
  lines 35–57). The 200 MP sample (12240×16320) **decoded fully under the
  defaults**. `open_heif` is lazy: the header took 7.5 ms with no RSS growth, so
  the worker's 25 MP check fits between `open_heif()` and `.data`. Keep
  `options.DISABLE_SECURITY_LIMITS = False` (the default,
  [`options.py`](https://github.com/bigcat88/pillow_heif/blob/v1.8.1/pillow_heif/options.py)).
- **Threads.** In the `--cpus=1` container, `pyvips.concurrency_get()` returned
  8, the host's cores. libvips sizes worker pools from that value
  ([`threadpool.c`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/iofuncs/threadpool.c)).
  pillow-heif defaults to `DECODE_THREADS = 4`. Pinning both to 1 left latency
  within noise and lowered peak RSS by 10–19 MiB per route. Set
  `VIPS_CONCURRENCY=1` and `pillow_heif.options.DECODE_THREADS = 1` to match
  the allocation; revisit if cores are added.
- **Latency.** 12 MP HEVC decoding took about 0.95 s here, extrapolating to
  about 2 s at the 25 MP limit. This is an estimate, not a measurement. The
  handoff is negligible beside it. The 60-second task timeout is not at risk.
- **Imports** (fresh process, median of 7): `PIL.Image` 22.7 ms, 1.0 MiB;
  `pyvips` 20.7 ms, 7.3 MiB; `pillow_heif` 33.8 ms, 6.8 MiB; `numpy` 183.7 ms,
  11.7 MiB. The recommended HEIC path imports no NumPy.

## 5. Should background removal share the libvips encode path?

The worker (`workers/background-removal/imaging.py`) uses three encode paths.
The API requests `response_format: "file"`, so the binary path is used unless
`return_mask` is set (`workers/background-removal/app.py`).

Measured on a 12 MP RGBA proxy: the landscape photo with a soft radial alpha.
All PNGs were pixel-exact.

| Encoder | ms | Bytes |
| --- | ---: | ---: |
| imagecodecs level 3 `UP` (**current binary fast path**) | 619 | 19,981,531 |
| libvips `compression=3, filter=up` | 647 | 19,981,552 |
| libvips `compression=3, filter=all` | 1,005 | 19,794,592 |
| Pillow `compress_level=6` (**current JSON/mask path and oversize fallback**) | 6,742 | 19,109,286 |
| imagecodecs level 6 `ALL` | 1,625 | 19,095,561 |
| libvips `compression=6, filter=all` | 1,693 | 19,095,582 |
| libvips `compression=6` with the default filter (`none`) | 895 | 32,654,305 |
| Pillow JPEG q95 (library-default subsampling) | 57 | 2,254,126 |
| libvips JPEG Q95 (auto subsampling → 4:4:4) | 87 | 2,885,690 |

- libvips does not speed up the hot path; imagecodecs already matches it.
- The slow path is Pillow level 6. imagecodecs, already in the GPU image,
  delivers the same speedup as libvips without adding a dependency. That is a
  separate GPU-worker change, subject to the checkpoint rollout procedure.
- On this proxy, the oversize fallback spent about 6.7 s and still produced
  19.1 MB, above the 12 MiB binary cap. A level-6 retry rarely rescues an output
  that much too large. Revisit the fallback in that change.
- libvips' PNG filter default is `NONE`
  ([`pngsave.c`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/foreign/pngsave.c),
  line 237), and its JPEG saver disables chroma subsampling at Q ≥ 90
  ([`vips2jpeg.c`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/foreign/vips2jpeg.c),
  line 679). Sharing code without explicit options would change output size.
- **Revisit** when background removal must expose the CPU worker's per-format
  options, such as WebP/AVIF quality or MozJPEG. At that point, share one Python
  encode module with explicit options in both images. Do not hand RGBA pixels
  to the CPU worker over the network. Adding pyvips-binary to the GPU image
  costs about 21 ms of import time and 7 MiB. Per AGENTS.md, that still needs a
  controlled cold-start comparison before promotion.

## 6. Route each job to the library that does it better

| Job | Library | Reason |
| --- | --- | --- |
| HEIC/HEVC decode | pillow-heif (standalone) | pyvips-binary cannot decode HEVC. The probe got "Support for this compression format has not been built in: HEVC". HEVC patent exposure and the bundled GPL x265 encoder are covered in #10. |
| Decode JPEG/PNG/WebP/GIF/AVIF/TIFF/SVG, autorot, ICC transforms, resize, palette reduction | libvips | Per #11. Note: pillow-heif 1.8.1 has no AVIF codec (`libheif_info()` lists only x265 and libde265), so AVIF input goes to libvips. |
| JPEG (MozJPEG), PNG (`filter=all`), WebP, GIF (cgif) encode | libvips | Per #11. Set `keep`, `filter`, and `subsample_mode` explicitly. |
| **AVIF encode** | **Pillow (libavif + aom)** | See below. |
| JPEG 2000 read, ICO/BMP write (if offered) | Pillow | Per #11: OpenJPEG is absent from pyvips-binary. |

**AVIF evidence** (1600×1200; equal nominal quality and aom speed 6; libvips
`effort=3` because speed = 9 − effort,
[`heifsave.c`](https://github.com/libvips/libvips/blob/v8.18.7/libvips/foreign/heifsave.c)):

| Image | Q | Pillow bytes / PSNR | libvips default bytes / PSNR | libvips `tune=ssim` bytes / PSNR |
| --- | ---: | --- | --- | --- |
| bird | 50 | 40,428 / 39.02 | 40,293 / 39.07 | 23,086 / 38.31 |
| landscape | 50 | 131,022 / 34.13 | 127,791 / 34.02 | 119,533 / 34.07 |
| text | 50 | **12,447** / 36.09 | **60,233** / 36.99 | 61,069 / 36.74 |
| text | 80 | **18,582** / 37.88 | **96,959** / 39.10 | 99,834 / 39.14 |

- libvips sets libheif's `tune` only when the caller sets it; the default is
  NULL. libheif 1.23.5's aom plugin then selects `AOM_TUNE_IQ` for YCbCr stills
  on aom ≥ 3.13
  ([`encoder_aom.cc`](https://github.com/strukturag/libheif/blob/v1.23.5/libheif/plugins/encoder_aom.cc),
  `tune_auto`). The default and `tune=iq` outputs were byte-identical. The
  earlier hypothesis in #11, that libvips lacked `tune=iq`, does not hold for
  this build.
- libvips sets `enable-intrabc` to FALSE ("Try to prevent the AVIF encoder
  from using intra block copy, helps ensure encoding time is more
  predictable", `heifsave.c` lines 660–664). It has no option to re-enable it. With
  `advanced=[("enable-intrabc", "0")]`, Pillow's text output grew from 12,447
  to 59,763 bytes, matching libvips. Disabling palette mode instead gave
  15,070 bytes. Intra block copy explains the gap.
- PSNR alone does not establish equal visual quality; see #11 for SSIMULACRA2
  methodology. The text gap is too large for metric choice to reverse. Before
  shipping, keep the effort/pixel caps, because worst-case encode time with
  intra block copy was not measured.

## Proposed HEIC decode adapter (sketch, not committed code)

```python
heif = pillow_heif.open_heif(raw, convert_hdr_to_8bit=not want_16bit)  # header only
if heif.mimetype == "image/heif-sequence": reject("HEIF sequences are not supported")
img = heif[heif.primary_index]
if img.size[0] * img.size[1] > MAX_PIXELS: reject("Image exceeds 25 megapixels")  # before .data
transfer = (img.info.get("nclx_profile") or {}).get("transfer_characteristics")
if transfer in (16, 18): reject("HDR (PQ/HLG) HEIC is not supported yet")
bands = {"L": 1, "LA": 2, "RGB": 3, "RGBA": 4}[img.mode.split(";")[0].replace("a", "A")]
fmt = "ushort" if ";" in img.mode else "uchar"
vi = pyvips.Image.new_from_memory(img.data, *img.size, bands, fmt)  # no copy
vi = vi.copy(interpretation=("rgb16" if bands >= 3 else "grey16") if fmt == "ushort"
             else ("srgb" if bands >= 3 else "b-w"))
if img.mode.split(";")[0].endswith("a"): vi = vi.unpremultiply().cast(fmt)
if icc := img.info.get("icc_profile"): vi.set_type(pyvips.GValue.blob_type, "icc-profile-data", icc)
# No EXIF and no autorot: libheif has already applied irot/imir.
# Metadata: report len(heif) top-level images and that the primary image was used.
```

After this point, HEIC input follows the same libvips path as every other
format.

## What would change this

- A pillow-heif release that exposes libheif sequences, or a libvips build with
  HEVC decoding (licensing permitting, see #10), would make the HEIC split
  unnecessary or change the sequence policy.
- If libvips exposes `enable-intrabc` or changes its AVIF defaults, re-run the
  text comparison. libvips AVIF could then replace the Pillow detour.
- Measurements on Beam x86_64, with real iPhone/Android HEIC uploads at the
  25 MP limit, would replace the relative timings above. Representative inputs
  are needed before making latency claims.
- An HDR product decision (gain maps, PQ/HLG, 10-bit AVIF output) would replace
  the reject-for-now rules in sections 2 and 3.
