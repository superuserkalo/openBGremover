# Audio processing and transcription options

Research checked 15 October 2026. These are implementation recommendations based
on primary documentation, model cards, and benchmark methodology. No models,
paid APIs, production workers, or quality benchmarks were run for this review.

## Recommendation

Use one CPU FFmpeg worker for audio conversion, compression, stream extraction,
resampling, and loudness processing. Add prerecorded transcription as a separate
model worker after durable jobs and accounting exist. Start speech cleanup with
DeepFilterNet and RNNoise comparisons. Keep generative audio restoration as an
experimental capability until listening tests establish that it preserves the
content users care about.

For owned transcription, benchmark Parakeet v3 against Whisper large-v3 through
faster-whisper first. Include Qwen3-ASR when its language coverage fits. For an
English-focused product, include Granite Speech 5.0 TurboCTC. The winner depends
on language, timestamps, difficult audio, cold starts, and cost per completed
minute. This is a shortlist, not a production selection.

## Compression and conversion

The container, codec, and transformation are different decisions. An M4A file
can carry AAC or ALAC. WAV often carries uncompressed PCM. A container extension
does not completely describe the audio. FFmpeg demuxes containers, decodes
compressed packets to PCM, applies filters, encodes PCM, and writes the chosen
container. When the destination supports the original codec, stream copying
changes the container without decoding or encoding and without generation loss.
Transcoding is necessary for codec changes and filters.
[FFmpeg pipeline documentation](https://ffmpeg.org/ffmpeg.html#Detailed-description).

Suggested initial profiles:

| User goal | Output and implementation |
| --- | --- |
| Smaller speech or general web audio | Opus through FFmpeg, with explicit bitrate and channel options |
| Broad compatibility | AAC in M4A or MP3; test the actual browser/device targets |
| Preserve decoded samples exactly | FLAC, with compatible sample representation and no resampling |
| Editing interchange | PCM WAV; expect larger files |
| Extract a video's audio | Stream copy when the chosen output accepts its codec; otherwise transcode once |

[Opus](https://opus-codec.org/) covers speech and music with variable bitrate and
channel/sample-rate capabilities. [FLAC](https://xiph.org/flac/) is lossless
compression. Converting an already damaged MP3 into FLAC preserves the decoded
MP3 samples; it cannot recover discarded sound. Repeated lossy transcoding can
compound damage. File compression also differs from a dynamic-range compressor,
which changes loudness relationships in the signal.

FFmpeg is the best initial engineering fit here because the same worker can
process video and audio. It does not imply every default encoder setting is
optimal. Expose a small set of tested profiles, not arbitrary command arguments.
Preserve channel layout deliberately and inspect duration and stream metadata
before charging or processing. Bound decoded sample count as well as input
bytes. Keep protocol access and output paths under server control.

FFmpeg is primarily LGPL, while optional components can change a build to GPL;
some combinations are nonredistributable. Record the exact build configuration,
dependencies, and notices. Patent obligations depend on the codecs and use, and
are separate from the FFmpeg software license.
[FFmpeg licensing documentation](https://ffmpeg.org/legal.html).

## What "audio upscaling" actually means

Resampling changes the sample rate. Ordinary interpolation from 16 kHz to
48 kHz does not restore the high-frequency information missing from the source.
Bandwidth extension uses a model to infer plausible missing frequencies.
Denoising removes unwanted sound; dereverberation reduces room effects; source
separation extracts vocals or instruments. These should be distinct product
options because they solve different problems.

| Candidate | Useful scope | Decision and licensing evidence |
| --- | --- | --- |
| DeepFilterNet | Full-band speech noise suppression; CPU-friendly native implementation | First cleanup candidate. Code is dual MIT/Apache-2.0. Pin the shipped model and verify its weight terms separately. [Repository](https://github.com/Rikorose/DeepFilterNet) |
| RNNoise | Lightweight recurrent speech denoiser | Low-complexity CPU baseline. BSD-3-Clause repository; audit selected model assets. [Repository](https://github.com/xiph/rnnoise) |
| Resemble Enhance | Speech denoising, distortion repair, and bandwidth extension | Evaluate when ordinary denoising is insufficient. MIT repository; independently retain provenance/terms of downloaded weights. [Repository](https://github.com/resemble-ai/resemble-enhance) |
| AudioSR | Generative bandwidth extension for speech, music, and sound effects to 48 kHz | Research candidate, not guaranteed reconstruction. MIT code and an Apache-2.0-tagged basic checkpoint. Its model card body is empty, so preserve more provenance before release. [Code](https://github.com/haoheliu/versatile_audio_super_resolution), [weights](https://huggingface.co/haoheliu/audiosr_basic), [paper](https://arxiv.org/abs/2309.07314) |
| Demucs | Music source separation | Separate future product. The original repository is archived, increasing maintenance burden. [Repository](https://github.com/facebookresearch/demucs) |

My recommendation is to sell "clean speech" before "audio upscaling". Test
speech damage, missing consonants, background-music suppression, stereo changes,
clipping, and processing delay. For restoration, use blind listening comparisons
against the original and simple resampling. A pleasing sound can still be an
inaccurate reconstruction. Do not automatically enhance audio before ASR without
measuring the effect on word errors.

## Transcription candidates

Whisper, faster-whisper, and whisper.cpp are not three independent recognition
models. Whisper supplies model weights; the latter two are inference
implementations. Quantization, decoding settings, batching, and segmentation
still affect measured results.

| Candidate | Why evaluate it | Limits and terms |
| --- | --- | --- |
| Whisper large-v3/turbo with faster-whisper | Broad multilingual reference, batching, word timestamps, integrated VAD; fits existing Python GPU work | MIT Whisper code and weights; MIT faster-whisper. Engine benchmark claims use specific older versions and hardware, so rerun locally. [Whisper](https://github.com/openai/whisper), [faster-whisper](https://github.com/SYSTRAN/faster-whisper) |
| whisper.cpp | CPU, Apple Silicon, quantized, and portable native inference | Good deployment alternative where native CPU/edge operation matters; benchmark against the same weights/settings. [Repository](https://github.com/ggml-org/whisper.cpp) |
| NVIDIA Parakeet-TDT-0.6B-v3 | High-throughput 600M model; 25 European languages including English and Bulgarian; character/word/segment timestamps | CC-BY-4.0. Language coverage is narrower than Whisper. Strong first challenger for a European-language product. [Model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) |
| NVIDIA Canary-1B-v2 | 25-language transcription and translation between English and the other supported languages | CC-BY-4.0; useful if translation becomes a requirement. [Model card](https://huggingface.co/nvidia/canary-1b-v2) |
| NVIDIA Canary-Qwen-2.5B | English quality challenger using a speech encoder and language-model decoder | English-only; training clips were at most 40 seconds, so longer-form behavior needs testing. Check bundled component licenses. [Model card](https://huggingface.co/nvidia/canary-qwen-2.5b) |
| Qwen3-ASR-1.7B/0.6B | Streaming and offline inference; 30 languages plus 22 Chinese dialects; Apache-2.0 | Timestamp alignment is a separate model covering 11 languages. Bulgarian is absent from the stated ASR list. [Model card](https://huggingface.co/Qwen/Qwen3-ASR-1.7B) |
| IBM Granite Speech 5.0 470M TurboCTC | Recent compact English model, non-autoregressive decoding, CPU/edge deployment options | Apache-2.0, English-only. Published throughput depends on hardware and batch shape. [Model card](https://huggingface.co/ibm-granite/granite-speech-5.0-470m-turboctc) |

Managed comparison candidates include
[Deepgram Nova-3](https://developers.deepgram.com/docs/models-languages-overview/),
[AssemblyAI Universal-3 Pro and Universal-2](https://www.assemblyai.com/docs/getting-started/models),
[ElevenLabs Scribe v2](https://elevenlabs.io/docs/overview/capabilities/speech-to-text/),
and [OpenAI transcription](https://developers.openai.com/api/docs/guides/speech-to-text).
Their current feature coverage differs. AssemblyAI's Pro model lists six
languages, while Universal-2 lists 99. OpenAI now recommends `gpt-transcribe`
for ordinary recorded transcription, while specific models handle speaker
labels or word timestamps. Compare the exact output contract, region, retention,
and billed extras. Do not select from vendor claims of universal superiority.

## Benchmark interpretation and release gate

The [Hugging Face Open ASR leaderboard](https://huggingface.co/spaces/hf-audio/open_asr_leaderboard)
is useful for shortlisting. Its
[15 October source registry](https://huggingface.co/spaces/hf-audio/open_asr_leaderboard/blob/main/init.py)
includes cleaned English sets, URGENT24 noisy speech, Voice Arena, private
scripted/conversational aggregates, and separate multilingual/long-form sources.
The current change note distinguishes contributor-reported public WER from
maintainer-verified private WER. The aggregate, dataset version, and evidence
origin matter. Published throughput is not a cold serverless response-time
measurement. This review does not claim a fresh numeric ranking; underlying CSV
fetches were unavailable in this research environment.

Evaluate at least 100 consented clips plus several long recordings across the
intended languages, accents, noise, silence, music, names, numbers, code-switching,
and overlapping speakers. Score word/character error by language and workload,
silence hallucinations, timestamp error, omissions, cold/warm latency, and total
cost per successful audio minute. Keep model revisions, decoding settings,
normalization, and hardware fixed and recorded. Human-corrected references are
required; a second ASR model is not ground truth.

Voice activity detection finds speech intervals. Alignment locates recognized
words in time. Diarization groups speech by speaker. They are separate from ASR
accuracy. If speaker labels are needed, evaluate
[pyannote Community-1](https://huggingface.co/pyannote/speaker-diarization-community-1),
which provides offline diarization under CC-BY-4.0 after gated model access.
Measure diarization error and speaker consistency over long files separately.
Do not label a speaker with a person's name without another identification step.

## Small-team deployment proposal

Offer audio/video-to-transcript with text, JSON segments, and SRT/VTT exports.
Start with bounded prerecorded inputs and one selected ASR model. Add speaker
labels only after a proven requirement. Video transcription extracts the audio;
video OCR reads visible text and is a different operation.

Run native codecs in the CPU media worker and ASR in an isolated model endpoint.
Keep temporary uploads and results in private object storage with expiry. Use
durable job state, idempotency, and recoverable reservations for long recordings.
Price against duration and optional model work. Measure startup, paid idle,
storage, and failed jobs before declaring self-hosting cheaper than a managed
API. Avoid loading every candidate into one permanently warm worker.
