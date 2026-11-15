# Specs: make a file

Shared rules, the `output` object and the result shape are in [README.md](README.md). These operations produce a new file from parts, data or instructions.

Runs-on marks: **Small** is a Cloudflare Container per job; **CPU** is a Beam CPU worker; **Browser** is Cloudflare Browser Run.

---

## `render`

Turns HTML, Markdown or a web address into a PDF or an image.

- **Accepts:** an HTML or Markdown file, or `input: { "url": … }` for a live page. **Returns:** a PDF or an image.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `page_size` | `a4`, `letter`, `a3`, `legal`, or `{ width, height }` | `a4` | PDF |
| `landscape` | Boolean | `false` | PDF |
| `margin` | Size, or one per side | `10mm` | PDF |
| `print_background` | Boolean | `true` | PDF |
| `viewport` | `{ width, height, scale }` | 1280 × 800, 1 | Image |
| `full_page` | Boolean | `true` | Image |
| `wait_for` | `load`, `network-idle`, or a number of milliseconds up to 10,000 | `load` | |
| `selector` | A CSS selector | None | Image of one element |
| `scripts` | Boolean | `true` for URLs; `false` for files | Whether the page's own scripts run |
| `theme` | `light`, `dark` | `light` | |

- **`output.format`:** **required**: `pdf`, `png`, `jpeg` or `webp`.
- **Rule:** a web address follows the URL rules in #6: public addresses only, checked again on every redirect and for every resource the page loads.
- **Rule:** an HTML or Markdown file is rendered with network access off. Images and styles it needs must be inline or passed as further `inputs`.
- **`data`:** `pages`, final address after redirects, resources blocked.
- **`from_file`:** the page `title`.
- **Errors:** `FETCH_FAILED`; `INPUT_TOO_COMPLEX` when the page does not settle within 60 seconds.
- **Engine:** Cloudflare Browser Run; Chromium in a container as backup. **Runs on:** Browser. **Usage:** `browser_seconds`.
- **Reference files:** an invoice in HTML with a web font inline; a Markdown file with a table and code; a page that redirects to a private address (must be refused); a page with an endless loading spinner.
- **Agent tasks:** "Turn this HTML report into a PDF." "Take a full-page screenshot of this address."
- **Readiness:** Ready.

---

## `fill-template`

Produces a finished document from a template and data.

- **Accepts:** `inputs`: a DOCX, PPTX, XLSX or HTML template, then optionally image files the data refers to. **Returns:** a document of the template's type, or a PDF.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `data` | JSON object up to 1 MB | **Required** | |
| `missing` | `error`, `blank`, `keep` | `error` | What to do with a placeholder that has no value |

- **Template language:** `{{ name }}` for values, `{% for item in items %}` for repeated rows and paragraphs, `{% if … %}` for optional parts. In XLSX and PPTX, placeholders in cells and text boxes; a table row holding a `for` repeats.
- **`output.format`:** the template's type, or `pdf`.
- **Rule:** templates run in a restricted mode with no file, network or code access, and a cap on loop count and output size.
- **Rule:** values are inserted as text, never as template code.
- **`data`:** placeholders found, placeholders left unfilled.
- **Errors:** `INVALID_OPTION` naming the placeholder with no value, or the template syntax error and where it is.
- **Engine:** docxtpl; python-pptx; openpyxl, with XlsxWriter as backup; LibreOffice or Browser Run for PDF. **Runs on:** Small; CPU when converting to PDF. **Usage:** `pages`.
- **Reference files:** an invoice DOCX with a repeating line-item row; a certificate PPTX with a name and an image; a template whose data contains template syntax (must appear as plain text); a template with a missing value under each `missing` mode.
- **Agent tasks:** "Fill this invoice template with these line items and give me a PDF." "Make 30 certificates from this template and this list of names" (expects a batch).
- **Readiness:** Ready.

---

## `make-variants`

Produces a set of sizes from one image in one call.

- **Accepts:** an image, including SVG. **Returns:** several images, and a manifest file.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `preset` | `favicons`, `app-icons`, `responsive`, `social` | None | Either `preset` or `sizes` is **required** |
| `sizes` | List of `{ width, height, name, fit }` up to 50 | None | |
| `widths` | List of widths | 320, 640, 960, 1280, 1920 | For `responsive` |
| `background` | Colour | Transparent | Fills when a size needs padding |

- **Presets:**
  - `favicons`: ICO with 16, 32 and 48; PNG 180 and 192 and 512; an SVG copy when the input is SVG; a web manifest.
  - `app-icons`: the iOS and Android launcher sizes.
  - `responsive`: each width, in the `output` format, with an HTML `srcset` snippet in the manifest.
  - `social`: 1200 × 630, 1080 × 1080, 1080 × 1920 and 1500 × 500, cropped around the subject.
- **`data`:** the manifest: name, size and purpose of each file.
- **Engine:** libvips. **Runs on:** Small. **Usage:** `megapixels` written.
- **Reference files:** a 1024 px logo PNG with transparency; an SVG; a photo for `social`; an input smaller than the largest size (expects a warning, no enlarging).
- **Agent tasks:** "Generate all the favicon files from this logo." "Make social media sizes of this banner."
- **Readiness:** Ready.

---

## `make-slideshow`

Makes a video from still images, with optional sound.

- **Accepts:** `inputs`: 1 to 200 images, then optionally one audio file. **Returns:** a video.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `seconds_per_image` | 0.1 to 60 | 3 | Or `durations`, one per image |
| `fit_to_audio` | Boolean | `false` | Spreads the images over the audio's length |
| `transition` | `none`, `crossfade` | `none` | |
| `motion` | `none`, `slow-zoom` | `none` | |
| `background` | Colour, or `blur` | Black | Behind images that do not fill the frame |

- **`output`:** video fields. Default 1920 × 1080, 30 fps.
- **Engine:** FFmpeg. **Runs on:** CPU. **Usage:** `output_seconds` × resolution.
- **Reference files:** five photos of mixed orientation with a 20 s track and `fit_to_audio`; one image with audio (a still-image music video).
- **Agent tasks:** "Make a video from these photos with this song." "Turn this podcast audio and cover image into a video for YouTube."
- **Readiness:** Ready.

---

## `overlay`

Places an image or a video on top of a video.

- **Accepts:** `inputs`: the base video, then the overlay image or video. **Returns:** a video.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `position` | `center`, the eight compass points, or `{ x, y }` | `southeast` | |
| `size` | Percent of the base width | 25 | |
| `opacity` | 0 to 1 | 1 | |
| `from`, `to` | Seconds | Whole video | |
| `margin` | Percent | 3 | |
| `audio` | `base`, `overlay`, `mix` | `base` | |

- **Rule:** a still watermark belongs to `watermark`; `overlay` is for picture-in-picture and timed graphics.
- **Engine:** FFmpeg. **Runs on:** CPU. **Usage:** `output_seconds` × resolution.
- **Reference files:** a screen recording with a webcam clip in a corner; a PNG with transparency shown from 5 s to 10 s.
- **Agent tasks:** "Put my webcam recording in the corner of this screen recording."
- **Readiness:** Ready.

---

## `replace-audio`

Swaps or mixes a video's sound.

- **Accepts:** `inputs`: a video, then an audio file. **Returns:** a video.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `mode` | `replace`, `mix` | `replace` | |
| `volume` | 0 to 2, for each of `original` and `new` | 1 | For `mix` |
| `if_shorter` | `silence`, `loop`, `cut-video` | `silence` | When the new audio ends before the video |
| `offset` | Seconds | 0 | Where the new audio starts |

- **Rule:** the picture is copied without re-encoding.
- **Engine:** FFmpeg. **Runs on:** CPU. **Usage:** `output_seconds`.
- **Reference files:** a clip with a voice-over swapped in; background music mixed under speech at 0.2.
- **Agent tasks:** "Replace the sound in this clip with this narration." "Add this music quietly under the video."
- **Readiness:** Ready. Preview off.

---

## `make-sheet`

Lays several images, or frames of a video, out on one image.

- **Accepts:** `inputs` of 2 to 400 images, or one video. **Returns:** one image, and a JSON map for sprite sheets.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `kind` | `contact`, `sprite`, `collage` | `contact` | `sprite` packs with no gaps and returns coordinates |
| `columns` | 1 to 40 | Chosen for a near-square sheet | |
| `cell` | `{ width, height }` | 320 × 180 for video frames; the first image's ratio otherwise | |
| `gap`, `background` | Pixels; colour | 8; white | |
| `labels` | `none`, `index`, `time` | `none` | `time` for video frames |
| `frames` | 2 to 400 | 16 | For a video input |

- **Rule:** labels are numbers and times we generate. File names are not drawn.
- **`data`:** for `sprite`, each cell's `x`, `y`, `width`, `height`.
- **Engine:** libvips; FFmpeg for frames. **Runs on:** Small; CPU for video. **Usage:** `megapixels` written.
- **Reference files:** 12 product photos into a 4 × 3 contact sheet; a 60 s video into a 4 × 4 sheet with times; 30 icons into a sprite sheet.
- **Agent tasks:** "Give me a contact sheet of this video so I can see what's in it." "Pack these icons into a sprite sheet with coordinates."
- **Readiness:** Ready.

---

## `make-waveform`

Draws a recording's waveform as an image.

- **Accepts:** audio, video. **Returns:** an image.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `width`, `height` | Pixels | 1800, 280 | |
| `color`, `background` | Colours | Dark grey; transparent | |
| `style` | `line`, `bars` | `bars` | |
| `channels` | `mixed`, `separate` | `mixed` | |

- **`data`:** optionally `peaks`: up to 2,000 values for drawing a waveform in a player, when `output.format` is `json`.
- **Engine:** FFmpeg. **Runs on:** CPU. **Usage:** `seconds_read`.
- **Reference files:** a 3-minute song; a stereo recording with one silent channel.
- **Agent tasks:** "Make a waveform image for this podcast episode."
- **Readiness:** Ready.

---

## `make-code`

Makes a QR code or barcode.

- **Accepts:** no input file. **Returns:** an image.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `content` | String up to 2,900 characters | **Required** | |
| `kind` | `qr`, `code128`, `ean13`, `upca`, `datamatrix` | `qr` | |
| `error_correction` | `low`, `medium`, `quartile`, `high` | `medium` | QR |
| `size` | Pixels on the longer side | 1024 | |
| `margin` | Modules | 4 | |
| `color`, `background` | Colours | Black; white | Low contrast returns a warning |
| `logo` | An input image | None | QR; raises error correction to `high` |

- **`output.format`:** `png`, `svg` or `pdf`. Default `png`.
- **Rule:** the result is decoded again before it is returned, and the job fails if it does not read back as `content`.
- **Errors:** `INVALID_OPTION` when `content` does not fit the kind, for example a 12-digit string for `ean13` with a wrong check digit.
- **Engine:** segno; python-barcode; zxing-cpp for the read-back. **Runs on:** Small. **Usage:** none beyond the job.
- **Reference files:** a URL as QR in SVG; a QR with a centre logo; an EAN-13 with a bad check digit.
- **Agent tasks:** "Make a QR code for this link with our logo in the middle."
- **Readiness:** Ready.

---

## `archive`

Packs files into one archive.

- **Accepts:** `inputs` of 1 to 1,000 files. **Returns:** one archive.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `names` | List of paths, one per input | The inputs' own names, made safe | Folders are written as `folder/file` |
| `level` | `store`, `fast`, `best` | `fast` | |
| `password` | String | None | ZIP with AES-256, or 7z |

- **`output.format`:** `zip`, `tar`, `tar.gz`, `tar.zst` or `7z`. Default `zip`.
- **Rule:** RAR cannot be created.
- **Engine:** libarchive; 7-Zip. **Runs on:** Small. **Usage:** `megabytes_written`.
- **Reference files:** 20 small files with nested folder names; a name containing `../`.
- **Agent tasks:** "Zip these files into one download."
- **Readiness:** Ready. Preview off.

---

## `extract-archive`

Unpacks an archive.

- **Accepts:** ZIP, TAR and its compressed forms, 7z, RAR. **Returns:** the files inside.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `list_only` | Boolean | `false` | Returns the listing and no files |
| `include` | List of glob patterns | Everything | |
| `password` | String | None | |

- **`data`:** per entry: `bytes`, `compressed_bytes`, detected `type`.
- **`from_file`:** per entry: its `path` inside the archive.
- **Limits:** 10,000 entries; 5 GB unpacked; a compression ratio above 200 for any entry stops the job with `INPUT_TOO_COMPLEX`; nested archives are not unpacked.
- **Rule:** paths are never used on our filesystem as given. Entries that point outside the archive, and links, are skipped and listed in `warnings`.
- **Engine:** libarchive; 7-Zip for RAR. **Runs on:** Small, inside the #18 wall. **Usage:** `megabytes_written`.
- **Reference files:** a ZIP with folders; a zip bomb; an archive with `../` entries and a symlink; a password-protected 7z.
- **Agent tasks:** "What's inside this zip?" "Unzip this and convert every image inside to WebP" (expects a pipeline).
- **Readiness:** Ready. Preview off.

---

## `subset-font`

Shrinks a font to the characters that are needed.

- **Accepts:** TTF, OTF, WOFF, WOFF2. **Returns:** a font.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `text` | String | None | One of `text`, `unicode_ranges` or `preset` is **required** |
| `unicode_ranges` | List such as `U+0020-007F` | None | |
| `preset` | `latin`, `latin-ext`, `cyrillic`, `greek` | None | |
| `keep_features` | List of OpenType feature tags, or `all` | Kerning and ligatures | |

- **`output.format`:** default `woff2`.
- **`data`:** glyphs before and after; bytes saved; characters asked for that the font does not contain.
- **Rule:** a font whose own embedding flags forbid modification returns a warning naming the flag. The decision to proceed is the caller's, and the job still runs.
- **Engine:** fontTools. **Runs on:** Small. **Usage:** none beyond the job.
- **Reference files:** a 400 KB variable font subset to `latin`; a font asked for a character it lacks.
- **Agent tasks:** "Make this font smaller for my website; I only need Latin characters."
- **Readiness:** Ready. Preview is a rendered sample line.

---

## `trace`

Turns a pixel image into a vector drawing.

- **Accepts:** images. **Returns:** an SVG.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `mode` | `color`, `black-and-white` | `color` | |
| `colors` | 2 to 64 | 16 | For `color` |
| `detail` | `low`, `medium`, `high` | `medium` | Higher keeps smaller shapes and makes a larger file |
| `smooth` | 0 to 1 | 0.5 | Curve fitting |
| `threshold` | 0 to 1 | 0.5 | For `black-and-white` |

- **`data`:** path count; output bytes.
- **Rule:** photographs trace poorly. A warning says so when the input looks like a photo.
- **Engine:** VTracer; potrace as backup for `black-and-white`. **Runs on:** Small. **Usage:** `megapixels`.
- **Reference files:** a 512 px logo PNG with three flat colours; a line drawing scan; a photo (expects the warning).
- **Agent tasks:** "Convert this logo PNG to an SVG."
- **Readiness:** Ready.
