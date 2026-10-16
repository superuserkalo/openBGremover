# OCR options for openBGremover

Research snapshot: 2026-10-15. This is source research, not a model benchmark or production acceptance. Recommendations assume a small team, owned processing, and the existing authenticated API.

## Recommendation

Offer two explicit modes: **text extraction** for words, lines, polygons, and recognition scores; **document parsing** for reading order, tables, formulas, and Markdown. Start text extraction with PP-OCRv6. Evaluate a compact VLM separately before shipping document parsing. PaddleOCR-VL-1.6 is a strong default candidate, but TeleOCR and OvisOCR2 now merit direct comparison. LightOnOCR-3 is another current challenger. There is no defensible universal OCR winner across photographs, receipts, handwriting, scripts, and complex documents.

For the first implementation, use CPU inference for PP-OCR and measure whether GPU batching improves the actual workload. Keep the document VLM on its own GPU endpoint. Do not run every image through both engines. Route by requested output first; consider selective fallback only after measuring errors and confidence calibration.

## What the alternatives actually do

| Option | Evidence and appropriate role | Caveat |
| --- | --- | --- |
| PP-OCRv6 | Detector plus recognizer, with tiny/small/medium variants and CPU/GPU deployment. Strong candidate for scene text, screenshots, receipts, and localized image text. | The headline 83.2% recognition and 86.2% detection Hmean are author results on in-house benchmarks, not OmniDocBench scores. |
| Tesseract 5 | Established LSTM OCR with 100+ languages and outputs including text, hOCR, TSV, and PDF. Useful CPU baseline for clean scanned print. | Layout parsing and difficult natural scenes need additional work. |
| PaddleOCR-VL-1.6 | Compact 0.9B document model. A practical first document-parser candidate with an existing Paddle ecosystem. | Evaluate the complete layout/crop/recognition pipeline, including missed regions and CPU work. |
| TeleOCR | Compact 1.2B document parser; leads the inspected OmniDocBench table. | Newer deployment stack; repository/model naming is changing and separate code-license evidence needs resolution. |
| OvisOCR2 | 0.8B page-to-Markdown model covering text, tables, formulas, and visual regions. | End-to-end generation can omit content or repeat; token limits and complete-page coverage matter. |
| GLM-OCR | 0.9B document model with PP-DocLayoutV3 integration. Useful compact challenger. | Its model and pipeline have separate licenses. |
| olmOCR 2 | 7B document model and a batch document-processing toolkit. Worth testing for English archive/scanned-document workloads. | Greater model footprint; toolkit rendering, rotation, and retries contribute to published results. |
| DeepSeek-OCR 2 | Document OCR with dynamic resolution and image/PDF examples. | A useful comparison, but its inspected document-parsing score does not justify choosing it by name alone. |
| dots.ocr / dots.mocr | Multilingual parsing; dots.ocr-1.5 was renamed dots.mocr and adds scene text/web-screen and graphical outputs. | Do not mistake a repository MIT badge for the full model agreement. |
| LightOnOCR-3 | Current 0.8B/1B/4B family with transcription and labeled bounding-box modes; 4B author report gives 86.3 on olmOCR-Bench. | Newly released; that score is not comparable with OmniDocBench's 96-point scores. |

Primary sources: [PP-OCRv6 paper](https://arxiv.org/abs/2606.13108), [PaddleOCR releases](https://github.com/PaddlePaddle/PaddleOCR), [Tesseract](https://github.com/tesseract-ocr/tesseract), [PaddleOCR-VL-1.6](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6), [TeleOCR](https://huggingface.co/XingChen-AGI/TeleOCR), [OvisOCR2](https://huggingface.co/ATH-MaaS/OvisOCR2), [GLM-OCR](https://github.com/zai-org/GLM-OCR), [olmOCR 2](https://huggingface.co/allenai/olmOCR-2-7B-1025), [DeepSeek-OCR 2](https://github.com/deepseek-ai/DeepSeek-OCR-2), [dots project](https://github.com/studio-dots-ai/dots.ocr), [LightOnOCR-3](https://huggingface.co/lightonai/LightOnOCR-3-4B).

Paddle's current README advertises 50 languages in PP-OCRv6's unified model, while one detector model card says 48. Do not advertise the broader toolkit's 100+ languages as the coverage of one selected recognizer. Pin the actual recognition weights and test each supported script. [README](https://github.com/PaddlePaddle/PaddleOCR), [model card](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_det_safetensors).

## Benchmark evidence

The inspected official OmniDocBench table is labeled `v1.6_full`. These are benchmark-maintainer published results, not measurements performed for this project:

| Model | Overall |
| --- | ---: |
| TeleOCR | 96.91 |
| OvisOCR2 | 96.47 |
| PaddleOCR-VL-1.6 | 96.34 |
| MinerU2.5-Pro | 95.75 |
| GLM-OCR | 95.22 |
| Unlimited-OCR | 94.00 |
| dots.ocr | 90.77 |
| DeepSeek-OCR 2 | 90.25 |

The score averages text edit similarity, table TEDS, and formula CDM. It is **not the percentage of pages extracted without error**. Reading-order error is reported separately. Version 1.6 added 296 pages and changed matching; the repository subsequently announced evaluation-code v1.7. Freeze dataset, evaluator commit, rendering, model revision, and pipeline options before comparing. [Official benchmark](https://github.com/opendatalab/OmniDocBench#end-to-end-evaluation).

Ovis's own card reports 96.58, whereas the inspected common table reports 96.47. Paddle's paper reports 96.33 versus 96.34 in that table. Preserve the source and setup with each number rather than mixing author claims and maintainer reruns. [Ovis card](https://huggingface.co/ATH-MaaS/OvisOCR2), [Paddle paper](https://arxiv.org/abs/2606.03264).

A September [independent discrepancy report](https://github.com/opendatalab/OmniDocBench/issues/258) obtained 95.25 using Paddle weights with custom orchestration and reported a formula-score gap even with the official configuration. The author discloses mixed-run provenance and a different evaluation environment. This is an unresolved reproducibility warning, not a replacement leaderboard result or proof that the published score is wrong.

OCRBench v2 tests a different question. It includes 10,000 bilingual question-answer pairs, 31 scenarios, and a private set, with recognition, localization, extraction, parsing, calculation, understanding, and reasoning tasks. It is relevant to a VLM that answers questions about visible text. It is not a direct throughput or faithful-transcription ranking. Its English and Chinese leaderboards differ. Do not combine OCRBench, OCRBench v2, and newer revisions into one ranking. [Benchmark authors](https://99franklin.github.io/ocrbench_v2/).

olmOCR-Bench uses document-specific checks covering text presence/absence, reading order, tables, and math. The olmOCR-2 FP8 toolkit result is 82.4 ± 1.1, including page rotation and retries. Use it alongside OmniDocBench when selecting a document pipeline, not as a replacement score. [Benchmark implementation](https://github.com/allenai/olmocr/tree/main/olmocr/bench), [model result](https://huggingface.co/allenai/olmOCR-2-7B-1025).

None establishes performance on our customers' languages, numbers, handwriting, receipts, blurred phone photos, or empty images. Traditional OCR also makes errors; a VLM can additionally produce plausible prose, change wording, or omit a region. Measure omissions and invented text explicitly. Do not treat generated confidence as a calibrated probability.

## Managed market alternatives

Mistral OCR 4.1 offers paragraph boxes, structural block labels, and confidence scores at the published $4/1,000 pages, or $5/1,000 annotated pages. It is a useful managed comparison for our private test set and low-volume cost baseline. An older benchmark row named only “Mistral OCR” does not establish OCR 4.1 quality. [Current model card](https://docs.mistral.ai/models/ocr-4-1).

Google Document AI Enterprise OCR and Azure Document Intelligence Read are credible managed baselines for text, layout, and handwriting; evaluate their language-specific support and required output rather than treating either brand as one interchangeable model. Their cloud terms and processing locations are part of a purchase decision. [Google](https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr), [Azure](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/read?view=doc-intel-4.0.0).

## Licensing findings

These are the inspected publishers' license declarations, not a legal clearance of every dependency or training asset. Pin revisions and retain license/notice files in the deployment inventory.

- PaddleOCR code is Apache-2.0. Inspected PP-OCRv6 medium [detector](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_det_safetensors), [recognizer](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_safetensors), and [PaddleOCR-VL-1.6](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6) weights declare Apache-2.0.
- [OvisOCR2](https://huggingface.co/ATH-MaaS/OvisOCR2) declares Apache-2.0 for the project/model. [LightOnOCR-3](https://huggingface.co/lightonai/LightOnOCR-3-4B) explicitly declares Apache-2.0 for research and commercial use.
- [TeleOCR weights](https://huggingface.co/XingChen-AGI/TeleOCR) declare Apache-2.0, but the inspected [pipeline repository](https://github.com/caipeng328/TeleOCR) did not show an explicit code-license declaration. Resolve this before copying its pipeline into production.
- [GLM-OCR](https://github.com/zai-org/GLM-OCR#license) explicitly distinguishes Apache-2.0 code and layout model from MIT OCR weights.
- DeepSeek-OCR 2 [code](https://github.com/deepseek-ai/DeepSeek-OCR-2) and [weights](https://huggingface.co/deepseek-ai/DeepSeek-OCR-2) declare Apache-2.0. Do not apply the original DeepSeek-OCR license by assumption.
- olmOCR [code](https://github.com/allenai/olmocr) and [weights](https://huggingface.co/allenai/olmOCR-2-7B-1025) declare Apache-2.0. The model card also states research/educational intended use and links responsible-use guidance; retain that notice for review.
- dots has MIT code plus a [separate model agreement](https://github.com/studio-dots-ai/dots.ocr/blob/master/dots.ocr%20LICENSE%20AGREEMENT), which expressly allows commercial/SaaS use subject to its conditions. Read the exact selected weight release's agreement.
- [Surya](https://github.com/datalab-to/surya/blob/master/README.md) currently declares Apache-2.0 code but modified AI Pubs Open Rail-M weights, with free startup usage below a $5M funding/revenue threshold and separate broader commercial licensing. It is not an unrestricted Apache model.

## Video OCR is already a real capability

Google Video Intelligence extracts visible video text with frame locations and timestamps. AWS Rekognition also supports asynchronous video-text detection; AWS explicitly says timestamps are not guaranteed to identify the exact first frame. This reads burned-in subtitles, slides, scoreboards, signs, and credits. Spoken words require transcription. [Google video OCR](https://docs.cloud.google.com/video-intelligence/docs/feature-text-detection), [AWS timestamp contract](https://docs.aws.amazon.com/rekognition/latest/APIReference/API_TextDetectionResult.html).

Proposed owned implementation:

1. Decode frames with their original presentation timestamps.
2. Detect text regions and associate them across frames using geometry and visual similarity.
3. Recognize representative sharp crops; re-recognize when content changes.
4. Consolidate repeated observations into text tracks with start/end times, polygons, and evidence frames.

Start with slides or burned-in subtitles in a bounded clip. Scene cuts alone miss text changes within a shot. Uniform sampling reduces compute but can miss text displayed between samples; a one-second interval cannot guarantee finding a 200 ms caption. Expose sampling as an accuracy/cost choice and use denser scans around changes. Frame-accurate extraction requires stronger coverage and boundary validation. This pipeline is a proposal, not a claim that PP-OCR alone handles tracking.

## Evaluation and rollout

Build a private, consented test set split by real input category and supported language. Compare PP-OCRv6 against Tesseract for plain extraction. For document mode, start PaddleOCR-VL-1.6 and OvisOCR2; add TeleOCR once code rights are clear, and LightOnOCR-3 as a recent challenger. Include Mistral OCR 4.1 as a managed baseline.

Measure character/word error, text-region recall, missing/invented text, reading order, table cells, exact numbers, empty-image false positives, and video track timing. Record full cold/warm latency, peak memory, failure rate, retry behavior, and cost per accepted output including idle time. Keep VLM text and structured output attributable to source regions where possible.

Ship bounded single-image OCR first. Add document pages and clips after durable jobs, idempotency, credit reconciliation, private storage, and recovery described in [the migration guide](migration.md). Do not automatically retry paid model calls. Revisit the two-engine choice only if one tested model meets both output contracts at an acceptable total cost.
