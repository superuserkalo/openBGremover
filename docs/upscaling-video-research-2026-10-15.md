# Image and video upscaling, and video background removal

Research checked 2026-10-15. This is a shortlist and evaluation proposal, not a benchmark performed on our infrastructure. Published speed figures below are author measurements with different workloads; they cannot rank providers or predict our end-to-end latency.

## Recommendation

For the first image-upscaling release, evaluate Real-ESRGAN against SwinIR and HAT on our actual inputs. Real-ESRGAN is the simplest initial implementation candidate, not an established quality winner. Offer ordinary resizing separately from AI detail reconstruction. Keep face restoration and more generative enhancement opt-in.

For video, evaluate a temporal model separately. Start with RealBasicVSR as a conventional baseline, FlashVSR v1.1 as a practical diffusion candidate, and SeedVR2 as a quality comparison. Add the newly released FlashVSR+ to the experiment, but treat its efficiency claims as provisional. For background removal, start with portrait video and a recurrent matting model. General object isolation needs a different selection and tracking flow.

## Image upscaling

Upscaling can mean interpolation, which enlarges the existing samples, or learned super-resolution, which estimates missing detail. Stronger texture synthesis can improve appearance while changing text, faces, or product details. A pleasing reconstruction is not proof that the added detail existed. SeedVR2's own model card warns about excess detail, oversharpening, large-motion failures, and incomplete restoration. [SeedVR2 model card](https://huggingface.co/ByteDance-Seed/SeedVR2-3B)

| Candidate | Why evaluate it | Limits and license evidence |
| --- | --- | --- |
| Real-ESRGAN | Established practical image restoration, native 2x/4x models, tiling, alpha handling, and small general/anime variants. | GAN texture reconstruction can change details. BSD-3-Clause repository; use official release weights and retain provenance. The inspected repository does not provide a separate weight-license declaration as explicit as SeedVR2's model card. [Repository](https://github.com/xinntao/Real-ESRGAN) |
| SwinIR | Classical, lightweight, and real-world restoration checkpoints make useful fidelity/quality baselines. | Select the correct checkpoint and degradation task. Classical bicubic benchmark scores do not establish quality on compressed phone photos. Apache-2.0 project, including linked pretrained models; record exact checkpoint provenance. [Repository](https://github.com/JingyunLiang/SwinIR) |
| HAT | Transformer comparison for reconstruction quality; repository supplies classical and real-world SR models. | More complex inference than the initial Real-ESRGAN integration. Benchmark memory and latency on identical images. Apache-2.0 code; official linked model downloads need an archived license/provenance record before deployment. [README](https://raw.githubusercontent.com/XPixelGroup/HAT/main/README.md), [license](https://raw.githubusercontent.com/XPixelGroup/HAT/main/LICENSE) |
| SeedVR2 | Modern generative restoration candidate covering image/video usage. | Heavy upstream video implementation; more detail is not always better. Apache-2.0 code and explicit Apache-2.0 official weights. [Code](https://github.com/ByteDance-Seed/SeedVR), [weights](https://huggingface.co/ByteDance-Seed/SeedVR2-3B) |
| SUPIR / HYPIR | Relevant generative restoration comparisons if commercial licensing is available. | SUPIR requires a separate commercial agreement for code and proprietary neural components. HYPIR also declares noncommercial use only without written permission. Exclude from the default commercial shortlist. [SUPIR license](https://github.com/Fanghua-Yu/SUPIR/blob/master/LICENSE), [HYPIR declaration](https://github.com/XPixelGroup/HYPIR#non-commercial-use-only-declaration) |

There is no universal VRAM requirement for an architecture. Input dimensions, output dimensions, precision, tile overlap, and checkpoint matter. SwinIR's own small-image measurement reports 0.539 seconds and 986.8M testing memory on a 2080 Ti for a 256×256 low-resolution input. That is a useful reproducibility example, not our latency forecast. Real-ESRGAN supports reducing tile size after an out-of-memory error. [SwinIR results](https://github.com/JingyunLiang/SwinIR#results), [Real-ESRGAN inference](https://github.com/xinntao/Real-ESRGAN/blob/master/inference_realesrgan_video.py)

Proposed initial scope: static sRGB images, 2x/4x, capped output pixels, explicit alpha handling, and no automatic face enhancement. Evaluate text/logos and transparent edges separately from natural photographs. An animated image must take the video path or receive an explicit unsupported-animation error.

## Video super-resolution

Real-ESRGAN can accept video through its script, but that script reads a frame, applies the image upsampler, then writes the result. It has no learned temporal state in that loop. Different estimated details on successive frames can shimmer. A temporal model uses neighboring frames or carried state to reduce this inconsistency and exploit motion. The VideoGigaGAN research explicitly studies the detail-versus-temporal-consistency problem. [Real-ESRGAN source](https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/inference_realesrgan_video.py), [VideoGigaGAN paper/project](https://videogigagan.github.io/)

| Candidate | Evidence and operational implication |
| --- | --- |
| RealBasicVSR | Apache-2.0 code, released checkpoints, video-oriented restoration and a sequence-length control. Useful non-diffusion baseline. Its upstream setup uses old PyTorch/MMEditing versions, so maintenance and compatibility need testing. [Official repository](https://github.com/ckkelvinchan/RealBasicVSR) |
| FlashVSR v1.1 | Apache-2.0 repository and official weight metadata. Authors report roughly 17 FPS at 768×1408 on one A100. Primarily optimized for 4x. Sparse-attention backend is an integration dependency; upstream reports tested A100/A800 and H200 behavior and warns some third-party ports change attention and degrade quality. [Code](https://github.com/OpenImagingLab/FlashVSR), [v1.1 weights and requirements](https://huggingface.co/JunhaoZhuang/FlashVSR-v1.1) |
| SeedVR2 | Upstream reports one H100 80GB handling 100 frames at 720×1280, and four H100s for larger resolutions in its documented configuration. That is a substantial serving footprint; community tiling/quantization may reduce it but needs separate quality and license verification. [Upstream inference requirements](https://github.com/ByteDance-Seed/SeedVR#-inference) |
| FlashVSR+ | Paper submitted October 13, 2026. Authors claim untiled 4K on one RTX 4090 24GB. Apache-2.0 repository with inference and checkpoint download instructions. The stock CLI center-crops/resizes input, so our adapter must preserve the requested geometry explicitly. Treat as a new evaluation candidate; this research did not independently reproduce its quality, memory, or weights licensing chain. [Paper](https://arxiv.org/abs/2610.17552), [code](https://github.com/OpenImagingLab/FlashVSR_Plus) |
| VideoGigaGAN | Useful research comparison for temporal consistency and detail synthesis. The inspected official project page supplies paper and demonstrations but no deployable code/weight link. It is not an actionable default based on the evidence found. [Official project](https://videogigagan.github.io/) |

Our proposed pipeline is decode → bounded temporal chunks → model → encode, with FFmpeg managing media decoding/encoding and timestamps. Preserve audio and frame timing, reset temporal state at scene cuts, inspect seams between chunks, and stream intermediate frames rather than keeping a whole film in RAM. These are implementation requirements, not capabilities proven by a model demo. Frame interpolation, which generates new moments in time, should be a separate option from spatial upscaling.

## Video background removal

Matting predicts partial opacity for hair, motion blur, and transparent edges. Segmentation identifies the object region. A segmentation mask alone does not satisfy our soft-alpha requirement.

| Candidate | Scope | Commercial and operational implications |
| --- | --- | --- |
| Robust Video Matting, RVM | Human video matting with recurrent temporal memory and no extra prompt. Upstream recommends MobileNetV3 for most uses and reports 104 FPS HD / 76 FPS 4K on GTX 1080 Ti. | GPL-3.0 code; code and pretrained models are published in the project, but archive the chosen binary's provenance. GPL permits commercial use subject to its terms; it is not a noncommercial license. The speed is model-author evidence, not whole-service performance. [Repository](https://github.com/PeterL1n/RobustVideoMatting), [license](https://raw.githubusercontent.com/PeterL1n/RobustVideoMatting/master/LICENSE) |
| MatAnyone / MatAnyone2 | Temporally consistent video matting. MatAnyone2 explicitly targets humans and was released in 2026; its name should not be taken to promise arbitrary objects. | NTU S-Lab License 1.0 allows noncommercial use and directs commercial users to obtain permission. Do not ship as an unlicensed paid feature. [MatAnyone license](https://raw.githubusercontent.com/pq-yang/MatAnyone/main/LICENSE), [MatAnyone2 scope](https://github.com/pq-yang/MatAnyone2), [MatAnyone2 license](https://github.com/pq-yang/MatAnyone2/blob/main/LICENSE.txt) |
| SAM 2 / SAM 2.1 | Promptable object segmentation and propagation through video. Appropriate for selecting an arbitrary foreground object. | Apache-2.0 checkpoints, code, and training code. Requires a matting/refinement stage if soft transparency is promised; do not simply label its segmentation output a high-quality alpha matte. [Official repository and licensing](https://github.com/facebookresearch/sam2) |

Proposed first product: remove a person's background from a short clip, return a composited preview plus a separately verified alpha-capable export. A general-object version would accept a point/box/mask to specify the subject, track it, allow corrections, and refine alpha. Multi-person clips, held objects, pets, glass, and translucent fabric require explicit test cases and scope decisions.

## Evaluation before selecting a model

Use a fixed, permissioned set of at least 100 images and 20 short clips covering portraits, products, logos/text, animation, old compressed footage, fast motion, and scene cuts. Include real degraded media and paired synthetically degraded samples. Freeze model revision, weight hash, precision, dimensions, tiling, color processing, and output encoding.

For upscaling, measure paired reconstruction error and perceptual quality separately, then blind-review identity, text correctness, edge artifacts, texture invention, and temporal flicker. A model can improve a perceptual score while inventing detail, so neither a single score nor attractive demo frames should select the winner. For matting, compare soft-alpha errors, hair edges, holes, and temporal stability against annotated/composited clips.

Record warm throughput, peak GPU memory and host RAM, output bytes, failure rate, and complete cold response time after observing zero containers. Compare cost per accepted image or minute including startup, idle, decode/encode, storage, and retries. Keep existing background-removal deployment unchanged during experiments. A dedicated worker is justified when models require different memory/dependencies or checkpoints; splitting every preset into another service is unnecessary.

Video jobs require durable reservations, idempotency, cancellation, resumable work, and single settlement before release, as required by [the project's migration guide](migration.md). Revisit the initial image model when a challenger wins blinded quality at an acceptable total cost; revisit video choices once measured temporal quality and operating costs justify a paid offering.
