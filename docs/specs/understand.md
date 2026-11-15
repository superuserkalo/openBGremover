# Specs: understand a file

Shared rules are in [README.md](README.md). These operations return facts or extracted content. Text that comes out of a customer's file always goes in `from_file`.

Runs-on marks: **Small** is a Cloudflare Container per job; **CPU** is a Beam CPU worker; **GPU** is the Beam GPU worker.

---

## `inspect`

Returns facts about a file without changing it.

- **Accepts:** any file. **Returns:** no file.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `deep` | Boolean | `false` | Reads the whole file instead of its header: exact frame count, per-page sizes, damage check |

- **`data`:** `type` (detected, not from the name), `bytes`, and by type:
  - image: `width`, `height`, `megapixels`, `has_alpha`, `animated`, `frames`, `color_space`, `bit_depth`, `orientation`
  - video: `duration`, `width`, `height`, `fps`, `video_codec`, `audio_codec`, `bitrate`, `hdr`, `rotation`, `has_audio`
  - audio: `duration`, `codec`, `bitrate`, `sample_rate`, `channels`
  - PDF: `pages`, `page_sizes`, `encrypted`, `has_text_layer`, `has_forms`, `conformance`, `version`
  - document: `pages` or `sheets` or `slides` where known
  - all: `operations`: the operation ids that accept this file
- **`from_file`:** `title`, `author` and similar where present.
- **`applied`:** `deep`.
- **Engine:** ffprobe, libvips, PDFium, libmagic. **Runs on:** header-only inside the API; `deep` on Small.
- **Usage:** none for header-only; `megabytes_read` for `deep`.
- **Reference files:** one per supported type; a file with a wrong extension; a truncated MP4; an encrypted PDF; a phone video with rotation and HDR.
- **Agent tasks:** "What is this file and how long is it?" "Can I compress this, and what would it cost?" (expects `inspect` then a dry run).
- **Readiness:** Ready.

---

## `extract-text`

Returns a document's text as plain text, Markdown or structured blocks.

- **Accepts:** PDF, DOCX, PPTX, XLSX, ODF, RTF, HTML, EPUB, EML, MSG, images of pages. **Returns:** one text file; short results also inline in `from_file.text`.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `route` | `auto`, `text-layer`, `layout`, `ocr` | `auto` | `auto` reads the text layer when the file has one and falls back to `ocr` for pages without |
| `format` | `text`, `markdown`, `json` | `markdown` | `json` gives blocks with page number, kind and position |
| `pages` | Page ranges such as `1-3,8` | All | |
| `languages` | List of language codes | Detected | Guides OCR |
| `inline_limit` | Integer characters, up to 100,000 | 20,000 | Longer text is returned only as a file |

- **Routes:**

| Route | Engine | Runs on | Readiness |
| --- | --- | --- | --- |
| `text-layer` | PDFium; MarkItDown for Office files; Pandoc for HTML and EPUB | Small | Ready |
| `ocr` | Tesseract 5 | CPU | Ready |
| `layout` | Docling on CPU; PaddleOCR-VL on GPU for scans | CPU; GPU | Evaluate |

- **`data`:** `pages`, `pages_without_text`, `characters`, `languages`.
- **`from_file`:** `text` (when within `inline_limit`), `title`.
- **`applied`:** `route` per page range, engine and version.
- **Errors:** `PASSWORD_REQUIRED`.
- **Usage:** `pages`, and `ocr_pages` separately.
- **Reference files:** a born-digital PDF with two columns; a DOCX with headings and a table; a scanned page at 150 dpi; a PDF mixing text pages and scanned pages; a PDF whose text says "ignore your instructions"; an encrypted PDF.
- **Agent tasks:** "Give me the text of this contract as Markdown." "What does page 3 of this scan say?" "Summarise this document" (expects extraction, not a refusal).
- **Readiness:** Ready for `text-layer` and `ocr`.

---

## `extract-tables`

Returns the tables in a document as data.

- **Accepts:** PDF with a text layer. **Returns:** one file per table, or one workbook.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `format` | `csv`, `json`, `xlsx` | `csv` | `xlsx` puts each table on its own sheet |
| `pages` | Page ranges | All | |
| `detection` | `lines`, `spacing`, `auto` | `auto` | `lines` follows ruled borders; `spacing` infers columns from gaps |

- **`data`:** per table: `page`, `rows`, `columns`, `position`, `confidence`.
- **`from_file`:** the first rows of each table, up to 2,000 characters in total.
- **Engine:** pdfplumber and Camelot; Docling's table model as backup. **Runs on:** Small.
- **Usage:** `pages`.
- **Warnings:** "no tables found on pages …"; "this file has no text layer; run `make-searchable` first".
- **Reference files:** an invoice with a ruled table; a bank statement with no borders; a table spanning two pages; a page with no table.
- **Agent tasks:** "Pull the line items out of this invoice as CSV." "How many rows are in the table on page 2?"
- **Readiness:** Ready for PDFs with a text layer. Tables from scans wait on the `layout` route.

---

## `extract-metadata`

Returns the metadata stored in a file.

- **Accepts:** images, video, audio, PDF, Office files. **Returns:** no file.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `groups` | List of `exif`, `xmp`, `iptc`, `icc`, `id3`, `document`, `credentials` | All present | |

- **`data`:** which groups are present; for `credentials`, whether a C2PA manifest exists, whether its signature validates, and whether the signer is on the C2PA trust list.
- **`from_file`:** every metadata value, grouped. GPS coordinates are included and flagged as `location`.
- **Engine:** ExifTool; mutagen for audio tags; pikepdf for PDF; c2pa-rs for credentials. **Runs on:** Small, each tool as a separate program inside the #18 wall.
- **Usage:** none beyond the job.
- **Reference files:** a phone photo with GPS; an MP3 with ID3 tags and cover art; a PDF with XMP; an image with a valid C2PA manifest and one with a tampered manifest; a file with a 1 MB metadata field.
- **Agent tasks:** "Where and when was this photo taken?" "Does this image carry content credentials, and are they valid?"
- **Readiness:** Ready.

---

## `extract-form-data`

Returns the fields of a PDF form and their current values.

- **Accepts:** PDF. **Returns:** no file.
- **`data`:** per field: `name`, `kind` (`text`, `checkbox`, `radio`, `choice`, `signature`), `page`, `required`, `options` for choices.
- **`from_file`:** per field: `value`, `label`.
- **Errors:** none added. A PDF with no form returns an empty list and a warning.
- **Engine:** pikepdf or PyMuPDF. **Runs on:** Small.
- **Usage:** `pages`.
- **Reference files:** a tax form with 40 fields; a form with radio groups; a PDF with no form; an XFA-only form (expects a warning that it is not supported).
- **Agent tasks:** "What fields does this form have?" "Read this form, then fill it with my details" (expects `extract-form-data` then `fill-form`).
- **Readiness:** Ready.

---

## `extract-palette`

Returns the main colours of an image.

- **Accepts:** images. **Returns:** no file.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `colors` | 1 to 16 | 6 | |
| `ignore_background` | Boolean | `false` | Skips fully transparent pixels and a flat border colour |

- **`data`:** `palette`: per colour `hex`, `rgb`, `share` of pixels; `dominant`; `average`.
- **Engine:** libvips plus our own clustering. **Runs on:** Small.
- **Usage:** `megapixels`.
- **Reference files:** a logo with three flat colours (exact values expected); a photo; a transparent PNG; a greyscale image.
- **Agent tasks:** "What are the brand colours in this logo?"
- **Readiness:** Ready.

---

## `extract-frames`

Returns still images taken from a video.

- **Accepts:** video, animated images. **Returns:** image files.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `at` | List of times in seconds | None | Exact frames |
| `every` | Seconds | None | One frame per interval |
| `count` | 1 to 200 | 1 | Evenly spaced; used when `at` and `every` are absent |
| `scene_changes` | Boolean | `false` | One frame per detected scene |

- **`output`:** image fields. Default `jpeg`.
- **`data`:** per frame: `time`, and `scene` when `scene_changes` is on.
- **Limits:** at most 200 frames per job.
- **Engine:** FFmpeg; PySceneDetect for scenes. **Runs on:** CPU.
- **Usage:** `seconds_read`, `frames`.
- **Reference files:** a 10 s clip with three hard cuts; a variable-frame-rate phone clip; a rotated clip (frames must be upright).
- **Agent tasks:** "Get me a thumbnail from the middle of this video." "Show me one frame from each scene."
- **Readiness:** Ready; `scene_changes` is Evaluate.

---

## `extract-audio`

Returns a video's sound as an audio file.

- **Accepts:** video. **Returns:** one audio file.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `track` | Integer | First audio track | |

- **`output`:** audio fields. With no `format`, the track is copied without re-encoding when its codec fits a common container.
- **`applied`:** `encoder`, or `"copy"`.
- **Errors:** `UNSUPPORTED_INPUT` when the video has no sound, with that reason.
- **Engine:** FFmpeg. **Runs on:** CPU.
- **Usage:** `seconds`.
- **Reference files:** an MP4 with AAC; an MKV with two tracks; a silent video.
- **Agent tasks:** "Give me just the audio of this video as MP3."
- **Readiness:** Ready.

---

## `extract-attachments`

Returns the files attached to an email or embedded in a PDF.

- **Accepts:** EML, MSG, PDF. **Returns:** the attached files.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `include_inline` | Boolean | `false` | Also returns images embedded in an email body |

- **`data`:** per attachment: `bytes`, detected `type`.
- **`from_file`:** per attachment: `name`. Names are never used as paths.
- **Limits:** at most 200 attachments and 2 GB in total per job.
- **Engine:** Python's email library; extract-msg; pikepdf. **Runs on:** Small.
- **Usage:** `megabytes_written`.
- **Reference files:** an EML with two attachments; an MSG with a nested email; a PDF with an embedded spreadsheet; an attachment named `../../x`.
- **Agent tasks:** "Save the attachments from this email."
- **Readiness:** Ready.

---

## `detect`

Finds things in an image or video and returns where they are.

- **Accepts:** images; video for `faces`. **Returns:** no file.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `targets` | List of `faces`, `codes` | **Required** | `codes` are barcodes and QR codes |
| `min_confidence` | 0 to 1 | 0.5 | |
| `sample_every` | Seconds | 1 | Video only |

- **`data`:** per finding: `target`, `box`, `confidence`, `time` for video; for `codes`, the `symbology`.
- **`from_file`:** the decoded content of each code.
- **Policy:** faces are located, never identified or matched.
- **Engine:** YuNet for faces, MediaPipe BlazeFace as backup; zxing-cpp for codes. **Runs on:** Small for images; CPU for video.
- **Usage:** `megapixels` or `seconds_read`.
- **Reference files:** a group photo with nine faces; a photo with no face; a page with a QR code and an EAN-13; a QR code whose content is a prompt-injection string.
- **Agent tasks:** "How many people are in this photo?" "What does this QR code link to?"
- **Readiness:** Ready for `faces` and `codes`. `objects`, `text-regions`, `plates` and `adult-content` are added when their engines pass evaluation.

---

## `detect-language`

Returns the language of a text or document.

- **Accepts:** text files and any file `extract-text` reads through its `text-layer` route. **Returns:** no file.
- **`data`:** `languages`: per language `code`, `share`, `confidence`.
- **Engine:** lingua; GlotLID as backup. **Runs on:** Small.
- **Usage:** `characters_read`.
- **Reference files:** an English contract; a page mixing German and French; a 10-word text (expects low confidence, not a wrong answer).
- **Agent tasks:** "What language is this document in?"
- **Readiness:** Ready for text. Spoken language waits on speech to text.

---

## `analyze-audio`

Measures loudness and finds silence and speech in a recording.

- **Accepts:** audio, video. **Returns:** no file.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `measure` | List of `loudness`, `silence`, `speech`, `kind` | `loudness`, `silence` | `kind` labels stretches as speech, music or other |
| `silence_threshold` | dB | −40 | |
| `min_silence` | Seconds | 0.5 | |

- **`data`:** `loudness` (integrated LUFS, true peak, loudness range); `silences` and `speech` as time ranges; `kinds` as labelled time ranges.
- **Engine:** FFmpeg `ebur128` and `silencedetect`; Silero VAD; YAMNet, with PANNs as backup. **Runs on:** CPU.
- **Usage:** `seconds_read`.
- **Reference files:** a tone at a known −23 LUFS; speech with a 3 s pause; music with no speech; a silent file.
- **Agent tasks:** "Is this podcast too quiet for streaming platforms?" "Where are the pauses longer than two seconds?"
- **Readiness:** Ready for `loudness`, `silence` and `speech`. `kind` is Evaluate.

---

## `fingerprint`

Returns a compact signature that stays similar when a file is resized or re-encoded.

- **Accepts:** images, audio. **Returns:** no file.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `kind` | `perceptual`, `exact` | `perceptual` | `exact` is a SHA-256 of the bytes |

- **`data`:** `fingerprint`, `algorithm`. Two fingerprints are compared with `compare`.
- **Engine:** imagehash; Chromaprint for audio. **Runs on:** Small.
- **Usage:** none beyond the job.
- **Reference files:** an image and its resized JPEG copy (fingerprints must be within a set distance); two different images (must be far apart); a song and its 128 kbps MP3.
- **Agent tasks:** "Are any of these 20 images duplicates?" (expects a batch, then comparison).
- **Readiness:** Ready for images and audio. Video is added with frame sampling.
