# Specs: check a result

Shared rules and the result shape are in [README.md](README.md). Two things that let an agent check its work are not operations and need no call: every result's `files[].facts`, and the `preview` image. The operations here cover the rest.

Runs-on marks: **Small** is a Cloudflare Container per job; **CPU** is a Beam CPU worker.

---

## `compare`

Says how two files differ.

- **Accepts:** `inputs` of exactly two files of the same kind: images, video, PDF, documents, or two `fingerprint` values passed in `options`. The first is the reference. **Returns:** a difference image or difference file where it applies.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `measure` | `quality`, `changes`, `identical` | `quality` for images and video; `changes` for PDF and documents | |
| `fingerprints` | Two values from `fingerprint` | None | Compares without the files |
| `pages` | Page ranges | All | PDF and documents |
| `sample_every` | Seconds | 1 | Video |
| `difference_file` | Boolean | `true` | An image with changed areas marked, or a text difference |

- **`data`** by measure:
  - `quality`: for images an SSIMULACRA2 score from 0 to 100 and a verdict of `visually-identical` (90 and above), `high`, `medium` or `low`; for video a VMAF score with its lowest stretch and when it occurs.
  - `changes`: for images the share of pixels changed and the boxes around changed areas; for PDFs and documents the pages that differ, and counts of text added and removed.
  - `identical`: whether the bytes match, and whether the decoded content matches.
  - fingerprints: a distance and a verdict of `same`, `similar` or `different`.
- **`from_file`:** for `changes` on documents, the changed text, up to 5,000 characters; the full difference is in the file.
- **Rule:** images of different sizes are compared after scaling the second to the first, and `applied` says so. Videos of different lengths are compared over the shorter, with a warning.
- **Rule:** the thresholds behind each verdict are published in the docs, so a caller can apply its own.
- **Errors:** `UNSUPPORTED_INPUT` when the two files are of different kinds.
- **Engine:** SSIMULACRA2 from the libjxl project; VMAF in FFmpeg; libvips; PDFium. **Runs on:** Small for images and PDF; CPU for video.
- **Usage:** `megapixels`; `seconds_read`; `pages`.
- **Reference files:** a PNG and its JPEG at quality 80 and at quality 20; two renders of one PDF with a changed paragraph; a video and its heavily compressed copy; two identical files with different metadata.
- **Agent tasks:** "Did compressing this image visibly hurt it?" "What changed between these two versions of the contract?"
- **Readiness:** Ready for images, video and PDF. Audio is Evaluate.

---

## `validate`

Checks a file against a standard or a purpose.

- **Accepts:** any file. **Returns:** no file.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `checks` | List of `readable`, `pdfa`, `pdfua`, `web-playable`, `email-safe` | `readable` | |
| `conformance` | `pdfa-1b`, `pdfa-2b`, `pdfa-3b` | The level the file declares | For `pdfa` |
| `max_bytes` | Integer | 25 MB | For `email-safe` |

- **Checks:**

| Check | Passes when |
| --- | --- |
| `readable` | The whole file decodes without error and its type matches its content |
| `pdfa` | veraPDF reports no violation of the PDF/A level |
| `pdfua` | The PDF carries accessibility tags, a language and a title; machine checks only, which cannot prove a document is accessible |
| `web-playable` | A video or audio file uses a container and codecs that current Chrome, Safari and Firefox play, with the index at the start so it can stream |
| `email-safe` | The file is under `max_bytes` and of a type common mail systems accept |

- **`data`:** per check: `passed`, and a list of `problems`, each with a `rule`, a plain description, where it occurs, and the operation that would fix it.
- **Rule:** a failed check is a successful job. The job fails only when the check itself could not run.
- **Rule:** every problem names a fix where we have one, for example `convert` with `output.conformance`, or `compress` with `max_bytes`.
- **Engine:** ffprobe, libvips and `qpdf --check` for `readable`; veraPDF for `pdfa` and `pdfua`; our own rules for the rest. **Runs on:** Small; CPU for veraPDF.
- **Usage:** `megabytes_read`; `pages` for PDF checks.
- **Reference files:** a valid PDF/A-2b and one with an unembedded font; a tagged and an untagged PDF; an MP4 with HEVC and the index at the end; a truncated JPEG; a PNG named `.jpg`.
- **Agent tasks:** "Will this video play in a browser?" "Is this PDF valid PDF/A for archiving, and if not, fix it" (expects `validate`, then `convert`, then `validate` again).
- **Readiness:** Ready.
