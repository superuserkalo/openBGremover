# Operation specs

Specs for the catalog operations whose engine and licence are settled ([#28](https://github.com/superuserkalo/openBGremover/issues/28), `docs/agent-catalog-research-2026-11-15.md`). Each spec is written to be implemented without further design. Nothing here is built.

This page holds what every operation shares. The group files hold what differs:

| File | Operations |
| --- | --- |
| [understand.md](understand.md) | `inspect`, `extract-text`, `extract-tables`, `extract-metadata`, `extract-form-data`, `extract-palette`, `extract-frames`, `extract-audio`, `extract-attachments`, `detect`, `detect-language`, `analyze-audio`, `fingerprint` |
| [change.md](change.md) | `compress`, `convert`, `resize`, `crop`, `rotate`, `watermark`, `trim`, `merge`, `split`, `mute`, `change-speed`, `normalize-loudness`, `trim-silence`, `remove-background`, `redact`, `strip-metadata`, `edit-metadata`, `burn-subtitles`, `sync-subtitles` |
| [pdf.md](pdf.md) | `extract-pages`, `delete-pages`, `reorder-pages`, `protect`, `unlock`, `add-page-numbers`, `add-bookmarks`, `fill-form`, `flatten`, `make-searchable`, `repair` |
| [make.md](make.md) | `render`, `fill-template`, `make-variants`, `make-slideshow`, `overlay`, `replace-audio`, `make-sheet`, `make-waveform`, `make-code`, `archive`, `extract-archive`, `subset-font`, `trace` |
| [check.md](check.md) | `compare`, `validate` |

58 operations. Decisions these build on: operation model (#3), pipelines and batches (#4), job contract (#5), inputs and storage (#6), option registry (#8), sandboxing (#18), keys (#22), agent surfaces (#24), agent success (#25).

## Naming

- An operation is named for what it does, across file types: `resize` covers images and video, `rotate` covers images, video and PDF pages.
- A different intent gets its own name. There are no aliases.
- Names that take something out of a file start with `extract-`. Names that produce a new file from parts start with `make-`.

## Request

```json
{
  "operation": "resize",
  "input": { "upload": "upl_…" },
  "options": { },
  "output": { "format": "webp", "max_width": 1024 },
  "preview": true,
  "dry_run": false,
  "retention": "1d",
  "deliver_to": null,
  "webhook": null
}
```

| Field | Meaning |
| --- | --- |
| `input` | One file: `{ "upload": id }`, `{ "url": … }`, `{ "job": id, "file": n }`, or `{ "inline": base64 }` up to 10 MB |
| `inputs` | An ordered list of the same, for operations that take several files |
| `options` | What the operation does. Defined per operation in the group files |
| `output` | How the result is encoded and sized. Shared per media type, below |
| `preview` | `true` or `false` overrides the operation's default |
| `dry_run` | Validates, inspects the file and returns the settings and usage that would apply. No charge, no result |
| `retention` | How long results are kept: `1h` to `30d`, default `1d` |
| `deliver_to` | A customer bucket or presigned upload URL to write results to (#6) |
| `webhook` | A URL called when the job ends (#5) |

Every option is optional unless its spec says **required**. An omitted option takes the default in its spec. An unknown or misplaced option is rejected with `INVALID_OPTION` before any charge.

## The shared `output` object

Any operation that produces a file of a media type accepts that type's `output` fields. Defaults keep the input's format and size.

**Images**

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `format` | `jpeg`, `png`, `webp`, `avif`, `gif`, `jxl`, `tiff`, `bmp`, `ico` | Same as input | Writing HEIC waits on #20 |
| `max_width`, `max_height` | Integer pixels | None | Never enlarges unless `fit` says so |
| `fit` | `inside`, `cover`, `fill`, `outside` | `inside` | |
| `quality` | 1 to 100 | 80; 60 for AVIF | Lossy formats |
| `lossless` | Boolean | `false` | WebP, AVIF, JPEG XL |
| `effort` | `fast`, `balanced`, `best` | `balanced` | Trades time for size |
| `max_bytes` | Integer | None | The platform searches for the best quality that fits |
| `quality_target` | SSIMULACRA2 score, 30 to 100 | None | The platform searches for the smallest file that reaches it |
| `keep_metadata` | `all`, `color`, `none` | `color` | `color` keeps the colour profile and orientation only |

Per-format encoder options (chroma subsampling, progressive scans, PNG palette and so on) follow the inventory in `docs/research/image-formats-encoders.md` on the `research/image-formats-encoders` branch.

**Video**

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `format` | `mp4`, `mov`, `webm`, `mkv`, `gif` | Same as input | MP4 and MOV depend on #20 |
| `video_codec` | `av1`, `h264`, `vp9` | AV1 for WebM and MKV; H.264 for MP4 and MOV | A format-level choice; the encoder is ours |
| `max_width`, `max_height`, `max_fps` | Number | None | |
| `quality` | 1 to 100 | 70 | Mapped to each encoder's own scale |
| `effort` | `fast`, `balanced`, `best` | `balanced` | `fast` is x264 veryfast or SVT-AV1 preset 10; `balanced` is medium or preset 8 |
| `max_bytes` | Integer | None | |
| `audio` | The audio fields below, or `false` to drop sound | Keep | |
| `hdr` | `keep`, `to-sdr` | `keep` where the format supports it | |

**Audio**

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `format` | `mp3`, `wav`, `flac`, `opus`, `ogg`, `m4a` | Same as input | M4A depends on #20 |
| `bitrate` | Integer kbps | Per format | Lossy formats |
| `sample_rate` | Integer Hz | Same as input | |
| `channels` | 1 or 2 | Same as input | |

**PDF**

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `conformance` | `pdfa-1b`, `pdfa-2b`, `pdfa-3b` | None | Converts to PDF/A |
| `fast_web_view` | Boolean | `false` | Orders the file so the first page shows before the rest arrives |
| `image_quality` | 1 to 100 | Keep | Re-encodes embedded images |
| `image_max_dpi` | Integer | Keep | Downsamples embedded images |

**Several result files**

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `archive` | `zip` | None | Packs all result files into one |

## Result

```json
{
  "id": "job_…",
  "operation": "resize@1",
  "state": "succeeded",
  "files": [
    { "url": "…", "expires_at": "…", "type": "image/webp", "bytes": 48213,
      "facts": { "width": 1024, "height": 683 } }
  ],
  "preview": { "url": "…", "type": "image/webp", "width": 512 },
  "applied": { "output": { "format": "webp", "quality": 80 }, "encoder": "libwebp 1.5.0" },
  "usage": { "megapixels": 12.2 },
  "data": { },
  "from_file": { },
  "warnings": [ ]
}
```

| Field | Rule |
| --- | --- |
| `files` | Always a list. Every file carries `facts`: type, size, and dimensions, duration or page count as they apply |
| `preview` | A small image the model can look at. On by default for operations that change how a picture looks |
| `applied` | Every resolved setting including defaults, the route taken, and the engine and its version |
| `usage` | The real units used; pricing reads these (#7) |
| `data` | Facts we computed: counts, sizes, scores, boxes |
| `from_file` | Text that came out of the customer's file. It is untrusted and appears nowhere else |
| `warnings` | Things that were not errors but the caller should know, such as "3 pages had no text" |

Operations that return facts and no file leave `files` empty.

## Errors

One shape on HTTP and MCP (#24): `code`, `message`, `fix`, `retryable`, `retry_after`, `field`, `docs`.

| Code | When |
| --- | --- |
| `INVALID_OPTION` | Unknown, misplaced or out-of-range option; names the field and the allowed values |
| `UNSUPPORTED_INPUT` | The operation does not accept this file type; lists what it accepts |
| `INPUT_TOO_LARGE` | Over the size, pixel, page or duration limit; states the limit |
| `INPUT_TOO_COMPLEX` | A time, memory or disk limit was hit while processing; no charge |
| `FILE_DAMAGED` | The file could not be read; suggests `repair` where it applies |
| `PASSWORD_REQUIRED` | An encrypted file and no password given |
| `OPERATION_NOT_ALLOWED`, `KEY_SPEND_LIMIT_REACHED`, `KEY_RATE_LIMITED` | Key limits (#22) |
| `INPUT_NOT_FOUND` | The upload or job result has expired |
| `FETCH_FAILED` | A URL input could not be fetched under the #6 rules |
| `PROCESSING_FAILED` | Our fault; no charge; retryable |

Group files list only the errors an operation adds.

## Limits

The launch limits in #6 apply unless a spec states a tighter one: images 50 megapixels for AI operations and 500 for the rest (target), PDFs 10,000 pages (target), audio 24 hours (target), video 12 hours (target). Targets are confirmed by measurement before they are published.

## Routes

Some operations can do the same job in more than one way, for example reading a document's text layer or running a model on its pages. Each way is a route. The platform picks from the file, the caller can force one with `options.route`, and `applied.route` says which ran. A route can be ready before the others.

## What every spec contains

1. What it does, in one sentence.
2. What it accepts and returns.
3. Options, with type, default and limits.
4. What it adds to `applied`, `data` and `from_file`.
5. Errors it adds.
6. Engine, backup, and where it runs.
7. The usage it records.
8. Reference files: named inputs with the facts their output must have. They run on every commit with no model involved.
9. Agent tasks: the plain-words requests the #25 suite uses for this operation.

## Reference files and agent tasks

- Reference files live in `evals/reference/<operation>/`, each with a small JSON file stating the expected output facts.
- Every operation's reference set includes a damaged file, a file at the limit, and a file whose text contains instructions.
- Agent tasks live in `evals/tasks/`. Each spec lists two to four; the full set follows the kinds in #25.
