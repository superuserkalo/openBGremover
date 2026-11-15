# Specs: change a file

Shared rules, the `output` object and the result shape are in [README.md](README.md). Unless a spec says otherwise, each operation here returns one file of the input's type and turns `preview` on by default.

Runs-on marks: **Small** is a Cloudflare Container per job; **CPU** is a Beam CPU worker; **GPU** is the Beam GPU worker. Images run on Small; video and audio on CPU; anything using LibreOffice on CPU.

---

## `compress`

Makes a file smaller without changing its format.

- **Accepts:** images, video, audio, PDF, SVG.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `level` | `light`, `balanced`, `strong` | `balanced` | A starting point; any `output` field overrides it |

- **`output`:** the fields for the input's type, except `format`. `max_bytes` and `quality_target` are the usual way to state the goal.
- **`data`:** `input_bytes`, `output_bytes`, `saved_percent`, and a quality score against the input for lossy results.
- **Rule:** the result is never larger than the input. If nothing smaller can be made, the original is returned with `applied.kept_original: true` and a warning saying so.
- **Rule:** formats that barely shrink in place (WAV, already-optimised PNG) return a warning that names the format to `convert` to.
- **Engine:** libvips encoders for images; FFmpeg for video and audio; Ghostscript and qpdf for PDF; svgo for SVG.
- **Usage:** `megapixels`; `output_seconds` × resolution; `pages`.
- **Reference files:** a 12 MP JPEG; an already-optimised PNG; a 1080p phone clip; a scanned PDF of 20 pages; a WAV; an SVG exported from a design tool.
- **Agent tasks:** "Make this photo under 500 KB." "Shrink this PDF so I can email it; it must stay readable." "Compress this video as much as you can without it looking worse."
- **Readiness:** Ready. H.264 and AAC outputs depend on #20. Preview off by default.

---

## `convert`

Changes a file's format.

- **Accepts → returns:**

| From | To |
| --- | --- |
| Images, including HEIC, SVG, camera raw and PSD | Any image format; PDF |
| Video | Any video format; GIF |
| Audio | Any audio format |
| DOCX, PPTX, XLSX, ODF, RTF, HTML, Markdown, EPUB, EML, MSG | PDF |
| DOCX, ODT, RTF, HTML, Markdown | Each other; EPUB |
| EPUB, MOBI, AZW3 | Each other; PDF |
| PDF | Images, one per page; PDF/A through `output.conformance` |
| CSV, XLSX, JSON, Parquet | Each other |
| SVG, EPS | PDF, PNG, each other |
| TTF, OTF, WOFF, WOFF2 | Each other |
| SRT, VTT, ASS | Each other |

- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `pages` | Page ranges | All | PDF and documents |
| `dpi` | 36 to 600 | 150 | PDF or vector to image |
| `sheet` | Name or index | All | Spreadsheets |
| `raw` | `{ white_balance, exposure }` | Camera settings | Camera raw only |

- **`output.format`:** **required**.
- **Rule:** when a video or audio file's streams already fit the target container and nothing else is asked for, they are copied, and `applied.encoder` is `"copy"`.
- **Rule:** an unsupported pair returns `UNSUPPORTED_INPUT` listing the formats this input can become.
- **Engine:** libvips; FFmpeg; LibreOffice; Pandoc; Calibre; Ghostscript; resvg; LibRaw; psd-tools; DuckDB; fontTools; pysubs2; Browser Run for email and HTML.
- **Usage:** as for `compress`.
- **Reference files:** HEIC with rotation and a wide-gamut profile to JPEG; DOCX with fonts not installed to PDF; a 3-sheet XLSX to CSV; MOV to MP4 with copyable streams; a camera raw file; an EPUB to PDF; an SRT with odd encoding to VTT.
- **Agent tasks:** "Turn this Word file into a PDF." "Convert these iPhone photos to JPEG." "I need this spreadsheet as CSV, only the second sheet."
- **Readiness:** Ready. PDF to Word, 3D and CAD pairs are Evaluate and not listed. Preview off by default.

---

## `resize`

Changes pixel dimensions.

- **Accepts:** images, video.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `width`, `height` | Integer pixels | None | At least one is **required**, or `scale` |
| `scale` | 0.01 to 8 | None | |
| `fit` | `inside`, `cover`, `fill`, `outside` | `inside` | `cover` crops to fill; `fill` stretches |
| `enlarge` | Boolean | `false` | Without it, smaller inputs are returned at their own size with a warning |
| `gravity` | `center`, `north`, `south`, `east`, `west`, `subject` | `center` | Used with `cover`; `subject` keeps the most salient area |

- **Rule:** enlarging uses plain resampling. Model-based upscaling is a separate operation.
- **Engine:** libvips; FFmpeg.
- **Usage:** `megapixels`; `output_seconds` × resolution.
- **Reference files:** a 12 MP photo to 1024 wide; a 200 px icon asked for 800 px without `enlarge`; a portrait video to 720p; an animated GIF.
- **Agent tasks:** "Resize this to 1200 by 630 for a link preview, keep the subject in frame."
- **Readiness:** Ready.

---

## `crop`

Cuts away part of the frame or page.

- **Accepts:** images, video, PDF pages.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `mode` | `box`, `aspect`, `subject`, `trim` | `box` | `trim` removes uniform borders or page margins |
| `box` | `{ x, y, width, height }` in pixels or percent | None | **Required** for `box` |
| `aspect` | Such as `16:9` | None | **Required** for `aspect` and optional for `subject` |
| `gravity` | As in `resize` | `center` | For `aspect` |
| `pages` | Page ranges | All | PDF |
| `margin` | Pixels or points | 0 | Kept around a `trim` |

- **`data`:** the box actually applied.
- **Engine:** libvips, including its attention-based crop for `subject`; FFmpeg; pikepdf.
- **Reference files:** a product photo with wide white borders (`trim`); a landscape photo with an off-centre face (`subject`, 1:1); a scanned page with dark edges.
- **Agent tasks:** "Crop this to a square around the person." "Remove the white space around this logo."
- **Readiness:** Ready. `subject` on video is Evaluate.

---

## `rotate`

Turns or mirrors an image, video or pages.

- **Accepts:** images, video, PDF.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `angle` | Degrees; PDF and video accept 90, 180, 270 only | 0 | |
| `flip` | `horizontal`, `vertical` | None | |
| `auto` | Boolean | `false` | Applies the stored orientation and clears it |
| `pages` | Page ranges | All | PDF |
| `background` | Colour | Transparent where supported, else white | For angles that are not right angles |

- **Rule:** right-angle turns of JPEG and video are done without re-encoding where the format allows; `applied.lossless` says whether that happened.
- **Engine:** libvips; FFmpeg; qpdf.
- **Reference files:** a JPEG with EXIF orientation 6; a phone video stored sideways; a PDF with one landscape page.
- **Agent tasks:** "This scan is upside down, fix it." "Rotate pages 2 and 5 of this PDF."
- **Readiness:** Ready.

---

## `watermark`

Places text or an image over the content.

- **Accepts:** images, video, PDF. **`inputs`:** the file, and optionally the watermark image as a second input.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `text` | String up to 200 characters | None | Either `text` or a second input is **required** |
| `position` | `center`, the eight compass points, or `tile` | `southeast` | |
| `opacity` | 0 to 1 | 0.5 | |
| `size` | Percent of the shorter side | 20 | |
| `margin` | Percent | 3 | |
| `rotation` | Degrees | 0 | |
| `color`, `font` | Colour; one of our bundled fonts | White with a dark outline; a sans-serif | Text only |
| `pages` | Page ranges | All | PDF |
| `from`, `to` | Seconds | Whole video | Video |

- **Rule:** the caller's `text` is content we were asked to draw. It is not treated as an instruction and is echoed only in `applied`.
- **Engine:** libvips; FFmpeg; pikepdf or PyMuPDF.
- **Reference files:** a photo with a tiled text mark; a video with a logo in a corner for the first 5 s; a 10-page PDF stamped "DRAFT".
- **Agent tasks:** "Stamp CONFIDENTIAL diagonally across every page." "Put my logo in the bottom right of this video."
- **Readiness:** Ready.

---

## `trim`

Keeps one time range of a video or recording.

- **Accepts:** video, audio.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `from` | Seconds or `hh:mm:ss.ms` | 0 | |
| `to` | Seconds or timestamp | End | Or `duration` |
| `duration` | Seconds | None | |
| `precise` | Boolean | `true` | `false` cuts at the nearest keyframe and copies the streams |

- **`data`:** the range actually kept.
- **Errors:** `INVALID_OPTION` when the range lies outside the file, stating its duration.
- **Engine:** FFmpeg. **Usage:** `output_seconds`.
- **Reference files:** a clip cut mid-way between keyframes with `precise` on and off; an audio file trimmed to its last 10 s.
- **Agent tasks:** "Cut this video to the part between 0:30 and 1:15."
- **Readiness:** Ready.

---

## `merge`

Joins several files into one, in the order given.

- **Accepts:** `inputs` of 2 to 100 files of one kind: video, audio, PDF, or images (into one PDF).
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `transition` | `none`, `crossfade` | `none` | Video and audio |
| `transition_duration` | Seconds | 0.5 | |
| `bookmarks` | Boolean | `true` | PDF: one bookmark per source file |

- **Rule:** video inputs that differ in size or frame rate are fitted to the first input, or to `output`; `applied` records what was changed.
- **Rule:** inputs that share codec and settings are joined without re-encoding.
- **Engine:** FFmpeg; qpdf; libvips. **Usage:** `output_seconds` × resolution; `pages`.
- **Reference files:** three clips with different resolutions; two PDFs, one encrypted; five images into a PDF.
- **Agent tasks:** "Combine these three PDFs in this order." "Join these clips into one video."
- **Readiness:** Ready.

---

## `split`

Cuts one file into several.

- **Accepts:** PDF, video, audio. **Returns:** several files.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `by` | `ranges`, `every`, `size`, `bookmarks`, `silence` | **Required** | `bookmarks` is PDF only; `silence` is audio and video |
| `ranges` | Page ranges or time ranges | None | For `ranges` |
| `every` | Pages or seconds | None | For `every` |
| `max_bytes` | Integer | None | For `size` |

- **Limits:** at most 500 result files.
- **Engine:** qpdf; FFmpeg. **Usage:** `pages`; `output_seconds`.
- **Reference files:** a 30-page PDF split every 10 pages; a PDF split at top-level bookmarks; a recording split at silences.
- **Agent tasks:** "Split this PDF into one file per chapter." "Break this recording into 10-minute parts."
- **Readiness:** Ready. Preview off by default.

---

## `mute`

Removes the sound from a video.

- **Accepts:** video. **Options:** none.
- **Rule:** the picture is copied without re-encoding.
- **Engine:** FFmpeg. **Usage:** `output_seconds`.
- **Reference files:** an MP4 with two audio tracks; a video that is already silent (returned unchanged with a warning).
- **Agent tasks:** "Remove the audio from this clip."
- **Readiness:** Ready. Preview off by default.

---

## `change-speed`

Plays a video or recording faster or slower.

- **Accepts:** video, audio.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `factor` | 0.25 to 8 | **Required** | 2 is twice as fast |
| `keep_pitch` | Boolean | `true` | |
| `audio` | `keep`, `drop` | `keep` | |

- **Engine:** FFmpeg. **Usage:** `output_seconds` × resolution.
- **Reference files:** a talk at 1.5× (duration must be two thirds, pitch unchanged); a clip at 0.5×.
- **Agent tasks:** "Speed this screen recording up to double."
- **Readiness:** Ready.

---

## `normalize-loudness`

Brings a recording to a standard loudness.

- **Accepts:** audio, video.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `target` | LUFS, −30 to −9 | −16 | −14 suits music streaming; −23 suits broadcast |
| `true_peak` | dBTP | −1 | |
| `preset` | `podcast`, `streaming`, `broadcast` | None | Sets the two values above |

- **`data`:** loudness before and after.
- **Rule:** measured in a first pass and applied in a second, so the target is met within 0.5 LU. A video's picture is copied.
- **Engine:** FFmpeg `loudnorm`. **Usage:** `seconds`.
- **Reference files:** a quiet voice recording at −30 LUFS; a clipped loud track; a video.
- **Agent tasks:** "Make this podcast episode the right loudness for Spotify."
- **Readiness:** Ready. Preview off by default.

---

## `trim-silence`

Removes silent stretches.

- **Accepts:** audio, video.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `where` | `ends`, `all` | `ends` | `all` also shortens pauses inside |
| `threshold` | dB | −40 | |
| `min_silence` | Seconds | 0.5 | |
| `keep` | Seconds | 0.2 | Silence left at each cut |

- **`data`:** the ranges removed and the time saved.
- **Engine:** FFmpeg; Silero VAD to protect quiet speech. **Usage:** `seconds`.
- **Reference files:** a voice memo with 5 s of silence at each end; an interview with long pauses.
- **Agent tasks:** "Cut the dead air out of this recording."
- **Readiness:** Ready. Preview off by default.

---

## `remove-background`

Cuts the subject out of an image.

- **Accepts:** images.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `mode` | `auto`, `quality`, `portrait`, `product`, `speed` | `auto` | Renamed from today's `quality` (#8) |
| `background` | `transparent`, a colour, or a second input image | `transparent` | |
| `return_mask` | Boolean | `false` | Adds the mask as a second file |
| `refine_edges` | Boolean | `true` | Clears colour under fully transparent pixels |

- **`output`:** image fields. Default `png`. A format without transparency needs a `background`.
- **Engine:** BiRefNet, as today. **Runs on:** GPU. **Usage:** `megapixels`.
- **Limits:** 50 megapixels.
- **Reference files:** the existing background-removal set: a portrait with loose hair, a product on white, glass, a busy scene with no clear subject.
- **Agent tasks:** "Remove the background and give me a 512 px PNG." "Put this product on a plain white background as a JPEG."
- **Readiness:** Ready; live today under the old route.

---

## `redact`

Hides things permanently.

- **Accepts:** images, video.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `targets` | List of `faces` | None | Either `targets` or `boxes` is **required** |
| `boxes` | List of `{ x, y, width, height }`, with `from`/`to` for video | None | |
| `style` | `blur`, `pixelate`, `fill` | `blur` | `fill` is a solid colour |
| `strength` | 1 to 100 | 60 | |
| `padding` | Percent | 15 | Grows each box |

- **`data`:** the boxes redacted, per frame range for video, and the count per target.
- **Rule:** the hidden pixels are replaced, not covered by a layer. For video, a face missed in single frames between two detections is covered for the gap.
- **Rule:** when a target finds nothing, the job succeeds with a warning and `data.count: 0`. It does not fail silently as "redacted".
- **Engine:** YuNet, MediaPipe BlazeFace as backup; libvips; FFmpeg. **Runs on:** Small for images; CPU for video.
- **Usage:** `megapixels`; `output_seconds` × resolution.
- **Reference files:** a street photo with six faces, two in profile; a video where a face leaves and re-enters; a photo with no faces.
- **Agent tasks:** "Blur every face in this photo." "Black out the area in the top left for the first ten seconds."
- **Readiness:** Ready for `faces` and `boxes`. `plates` and personal data in PDFs are Evaluate.

---

## `strip-metadata`

Removes stored metadata.

- **Accepts:** images, video, audio, PDF, Office files.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `keep` | List of `color`, `orientation`, `copyright`, `credentials` | `color`, `orientation` | Orientation is applied to the pixels when it is not kept |

- **`data`:** the groups removed, and whether a location was among them.
- **Rule:** the content is not re-encoded. For PDFs, document properties, XMP and hidden revision data are removed.
- **Engine:** ExifTool; qpdf; FFmpeg. **Usage:** none beyond the job.
- **Reference files:** a phone photo with GPS; a PDF with an author and earlier revisions; a DOCX with tracked-change authors.
- **Agent tasks:** "Remove the location data from these photos before I post them."
- **Readiness:** Ready. Preview off by default.

---

## `edit-metadata`

Sets or removes named metadata fields.

- **Accepts:** images, audio, video, PDF.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `set` | Map of field to value | None | Fields: `title`, `author`, `description`, `copyright`, `keywords`, `date`, `artist`, `album`, `track`, `language` |
| `remove` | List of fields | None | |
| `cover` | A second input image | None | Audio cover art |

- **Rule:** only the listed fields are accepted; raw tag names are rejected with the list of allowed fields.
- **Engine:** ExifTool; mutagen; pikepdf. **Usage:** none beyond the job.
- **Reference files:** an MP3 given a title, artist and cover; a PDF given a title and author; a JPEG given a copyright line.
- **Agent tasks:** "Set the title and author of this PDF." "Tag these tracks with the album name."
- **Readiness:** Ready. Preview off by default.

---

## `burn-subtitles`

Draws subtitles permanently into the picture.

- **Accepts:** `inputs`: a video, then a subtitle file (SRT, VTT, ASS).
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `font`, `size`, `color`, `outline` | One of our bundled fonts; percent of height; colours | A sans-serif, 5, white, black | Ignored for ASS files that carry their own styling unless `override_style` is on |
| `position` | `bottom`, `top` | `bottom` | |
| `override_style` | Boolean | `false` | |

- **Rule:** the subtitle text is content from a file. It is drawn, never interpreted.
- **Engine:** FFmpeg with libass. **Usage:** `output_seconds` × resolution.
- **Reference files:** a clip with an SRT in a right-to-left language; an ASS file with positioning; a subtitle file longer than the video.
- **Agent tasks:** "Add these subtitles to the video so they're always visible."
- **Readiness:** Ready.

---

## `sync-subtitles`

Shifts a subtitle file's timing to match the video.

- **Accepts:** `inputs`: a subtitle file, then the video or audio. **Returns:** a subtitle file.
- **Options:**

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `offset` | Seconds | None | A fixed shift; skips detection |
| `max_offset` | Seconds | 60 | Search range |

- **`data`:** the offset and any stretch applied, and a fit score.
- **Rule:** a low fit score returns the best attempt with a warning, not an error.
- **Engine:** ffsubsync. **Runs on:** CPU. **Usage:** `seconds_read`.
- **Reference files:** an SRT delayed by 2.4 s against its video; an SRT made for a 25 fps version of a 23.976 fps video.
- **Agent tasks:** "These subtitles are a couple of seconds late, fix the timing."
- **Readiness:** Ready. Preview off.
