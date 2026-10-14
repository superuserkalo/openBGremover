# Background-removal quality research

Checked 14 October 2026. This is a source review and a proposed experiment. No
alternative model was run, deployed, or shown to beat our production checkpoint.

The first comparison should keep the current model and remove the website's
1400-pixel input/output caps. Then compare it with `BiRefNet_dynamic` and BEN2
Base on the same original images. Add Lucida v7 when failures involve glass,
camouflage, artwork, or text. Public results support testing these candidates;
they do not establish a replacement that wins across our workload.

The completed upload-resolution fix, its cold/warm comparison, and the large
output limitation are documented in
[original-resolution uploads and latency](full-resolution-upload.md). Those
measurements retain HR-matting and do not compare model quality.

## What we currently run

[The worker](../workers/background-removal/app.py) pins
`ZhengPeng7/BiRefNet_HR-matting` at
`5d6b6f8adcb5b417c871b1d84ceaae9871355b7f`. It resizes every inference input to
2048 × 2048, uses FP16 on an RTX 4090, and retains soft alpha. This matches the
publisher's dedicated high-resolution transparency/matting model and inference
recipe. It is not the small or standard 1024-pixel BiRefNet variant.
[Official model card](https://huggingface.co/ZhengPeng7/BiRefNet_HR-matting).

[Our image pipeline](../workers/background-removal/imaging.py) resizes the
predicted mask to the source dimensions and applies it to the original RGB
pixels. It does not estimate clean foreground colors. Therefore two different
failures need separate inspection: a wrong alpha mask, and background-colored
fringes inside partly transparent edge pixels. BiRefNet's own
[`refine_foreground`](https://github.com/ZhengPeng7/BiRefNet/blob/main/image_proc.py)
estimates foreground RGB from an existing mask. It can be tested separately for
fringes; it does not recover a subject that the mask omitted.

## Candidates and what the evidence supports

| Candidate | Intended use and evidence | Assessment |
| --- | --- | --- |
| **BiRefNet_dynamic** | General segmentation trained with arbitrary shapes from 256 × 256 to 2304 × 2304. Its author reports better results than general and HR-general on DIS-VD and TE-P3M-500-NP. The card does not establish superiority to HR-matting. [Card](https://huggingface.co/ZhengPeng7/BiRefNet_dynamic) | First in-family challenger, particularly for missed objects or unusual aspect ratios. Start at bounded 2048 input for comparison, then test aspect-preserving input independently. |
| **BiRefNet_HR** | General segmentation trained at 2048 × 2048. Its DIS-VD weighted F score is 0.894 at 2048 versus 0.840 when the same checkpoint is run at 1024. Standard general BiRefNet scores 0.877 at its 1024 setting. These are publisher measurements, not HR-matting comparisons. [Card](https://huggingface.co/ZhengPeng7/BiRefNet_HR) | Useful diagnostic if HR-matting chooses the wrong subject. It is not automatically better at translucent boundaries. |
| **BiRefNet-matting / portrait / lite** | The model zoo separates general segmentation, general matting, portrait matting, and smaller backbones. General models use mixed segmentation and matting datasets; the matting training mix includes P3M, AM-2k, AIM-500, HIM2K, and other alpha datasets. [Model zoo](https://github.com/ZhengPeng7/BiRefNet#model-zoo) | No evidence that moving down from HR-matting to a smaller or portrait-only checkpoint solves arbitrary uploads. Keep these out of the first quality comparison. |
| **BEN2 Base** | Public weights use DIS5K plus a publisher-owned 22K segmentation dataset. The publisher distinguishes the open Base weights from its fuller commercial model. `refine_foreground` is an optional RGB postprocessing step. [Model card](https://huggingface.co/PramaLLC/BEN2), [repository](https://github.com/PramaLLC/BEN2) | First different-architecture challenger. Benchmark the downloadable Base weights; a hosted demo of the commercial model is not evidence for Base. |
| **InSPyReNet** | High-resolution salient-object detection using low/high-resolution pyramid blending. Its application converts saliency scores into alpha and can estimate foreground colors. The publisher warns that dynamic resizing trades stability for detail. [Research repository](https://github.com/plemeri/InSPyReNet), [application](https://github.com/plemeri/transparent-background) | Second cross-family candidate for hard objects and thin structures. A soft saliency score alone does not establish accurate glass opacity. Pin `base`; do not silently track `base-nightly`. |
| **Lucida v7** | A 1024-pixel fine-tune of BiRefNet_HR targeting transparency, camouflage, text, effects, and illustrations. The publisher reports improvements in those categories but worse hair, thin structures, and complex scenes than some comparators. [Model card](https://huggingface.co/egeorcun/lucida), [results](https://github.com/egeorcun/lucida#benchmark) | Strong targeted experiment. Use `model.safetensors` v7, not the experimental ComfyUI file with different preprocessing. The publisher reverted v13 after real-artwork regressions, which reinforces the need for our own examples. |

The BEN paper compares BEN Base and Base+Refiner separately on DIS-VD. For
example, weighted F is 0.871 for Base and 0.896 with the refiner, versus 0.863 for
its BiRefNet comparator. This is a segmentation benchmark for the paper's models,
not a controlled test of downloadable BEN2 Base against our later HR-matting
checkpoint. [BEN paper](https://arxiv.org/html/2501.06230v2).

Lucida provides a more relevant category comparison: its 203-image test reports
alpha MAE of 0.0358 on transparency versus 0.0687 for BiRefNet_HR, but 0.0093 on
hair versus 0.0048 for BiRefNet_HR. Lower is better. Its benchmark uses held-out
dataset splits and synthetic categories; it excludes HR-matting and dynamic.
These are the author's results, not an independent reproduction. The synthetic
design category also failed to predict the later real-artwork regression.
[Results](https://github.com/egeorcun/lucida#benchmark),
[methodology](https://github.com/egeorcun/lucida/blob/main/docs/benchmark.md),
[rollback disclosure](https://huggingface.co/egeorcun/lucida).

Two newer releases deserve a record but are lower priority:

- **FeyNobg** expands BiRefNet and reports strong segmentation S-measure results.
  Its authors explicitly converted all training labels to binary masks, including
  matting datasets. That makes it more interesting for subject selection than as
  evidence of better fractional transparency. The model is approximately 263M
  parameters and uses 1024 × 1024 input. Its published runtime comparison concerns
  library implementations of BiRefNet, not our Beam deployment.
  [Publisher report](https://usefeyn.com/blog/feynobg/),
  [model zoo](https://github.com/feyninc/nobg#model-zoo).
- **withoutBG Open Weights** now routes between its matting model and BiRefNet.
  The open bundle explicitly omits the edge refiner available through its Cloud
  API. This adds multiple model components and another runtime to maintain.
  There is no controlled HR-matting comparison in the reviewed card.
  [Open weights card](https://huggingface.co/withoutbg/withoutbg-openweights-onnx).

## Free weights and commercial use

Here, free means downloadable without a model-license fee. Compute still costs
money. A permissive code license does not automatically cover unrelated weights
or settle training-data provenance.

| Release | Code | Weights and restrictions checked |
| --- | --- | --- |
| Official BiRefNet variants | [MIT](https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE) | HR-matting, HR, and dynamic model cards declare MIT. Preserve attribution and pin the exact model revision. |
| BEN2 Base | [MIT](https://github.com/PramaLLC/BEN2/blob/main/LICENSE) | [Official weights card declares MIT](https://huggingface.co/PramaLLC/BEN2). Its separate commercial model is outside this permission. |
| InSPyReNet / transparent-background | [InSPyReNet MIT](https://github.com/plemeri/InSPyReNet/blob/main/LICENSE), [application MIT](https://github.com/plemeri/transparent-background/blob/main/LICENSE) | Official checkpoints are linked from these MIT projects. No separate weight-specific license was found in the reviewed release/configuration; retain upstream provenance and confirm the exact artifact's terms before promotion. |
| Lucida v7 | [MIT](https://github.com/egeorcun/lucida/blob/main/LICENSE) | [Card explicitly says weights and code are MIT](https://huggingface.co/egeorcun/lucida). It also discloses research-only or unclear training-dataset licenses. This is a documented provenance concern, not proof that its weight license becomes non-commercial. |
| FeyNobg | [Apache-2.0 library](https://github.com/feyninc/nobg/blob/main/LICENSE) | [Model card declares Apache-2.0](https://huggingface.co/feyninc/FeyNobg). |
| withoutBG Open Weights | Apache-2.0 SDK | [Composite license](https://withoutbg.com/open-model/license): Apache-2.0 portions, MIT BiRefNet, and DINOv3 terms including attribution and use restrictions. Do not describe the entire bundle as plain Apache/MIT. |
| BRIA RMBG-2.0 | Model-specific terms | [Publisher requires a commercial agreement](https://huggingface.co/briaai/RMBG-2.0) for commercial self-hosting. It does not meet this search's free-commercial criterion. |

## Latency, memory, and cost implications

Removing the browser's 1400-pixel limit does **not** increase the current neural
network's 2048 × 2048 tensor. Model weights, GPU allocation, checkpoint warmup,
and inference shape stay the same. Larger uploads and native-size outputs can
still increase transfer time, image decoding, mask resizing, PNG encoding,
response size, and host RAM. Both cold and warm complete requests can therefore
take longer. This follows from the current
[worker](../workers/background-removal/app.py) and
[image pipeline](../workers/background-removal/imaging.py); it is not a latency
measurement. The existing 10 MiB input, 25-megapixel image, frame, and output
limits remain important.

| Candidate | Published implementation detail | What must be measured here |
| --- | --- | --- |
| HR-matting / HR | Fixed 2048 input and FP16 examples. | Warm inference, native-resolution image work, peak host/GPU memory, and cold checkpoint restore. |
| Dynamic | Arbitrary input shapes in the training range. | Resolution and aspect ratio affect actual GPU work. Bound dimensions/pixels; do not feed unrestricted originals. |
| BEN2 Base | [Official code](https://github.com/PramaLLC/BEN2/blob/main/BEN2.py) resizes to 1024 and uses CUDA FP16 autocast with local/global views. | Smaller input does not imply a particular speedup. Measure the full pipeline, including optional foreground refinement. |
| InSPyReNet base | [Configuration](https://github.com/plemeri/transparent-background/blob/main/transparent_background/config.yaml) sets 1024 input; [dynamic processing](https://github.com/plemeri/transparent-background/blob/main/transparent_background/Remover.py) uses a 1280 resize parameter. | Test fixed/static first. Record resize mode, foreground estimation cost, and small-image failures. |
| Lucida v7 | [Recipe](https://huggingface.co/egeorcun/lucida) uses 1024 input and FP32. | Verify FP16 quality and compatibility before treating it as equivalent. |

BiRefNet's published 4090 timing, 57.7 ms in FP16, is for standard 1024 inference;
the accompanying approximately 3.5 GB figure is not our 2048 HR-matting memory
requirement. These figures exclude our HTTP path and cold lifecycle.
[Publisher efficiency notes](https://github.com/ZhengPeng7/BiRefNet#model-zoo).
Use the [pipeline comparison](pipeline-latency.md) for the measured baseline
and retained allocation.
No reviewed alternative provides a directly comparable Beam cold-start result.

## Smallest useful experiment

1. Use 24 original images, four examples each of hair/fur, products, thin
   structures, transparency, low contrast/clutter, and illustration/text.
   Include the user's failing examples and portrait/landscape images above 1400
   pixels. Keep rights-cleared originals and explicit expected subjects.
2. Compare the old website preparation with original-image submission using
   the same pinned HR-matting worker. Keep a common display scale for judging
   masks and inspect native-resolution crops separately. Record original/input/
   output dimensions so sharper RGB is not mistaken for a better alpha mask.
3. Run corrected HR-matting, dynamic, and BEN2 Base with pinned code/weights.
   Add Lucida v7 on its target categories; add HR or InSPyReNet if failures
   chiefly involve subject selection or thin structures. Use each model's
   documented preprocessing. Compare optional RGB refinement as a separate arm.
4. Review blind composites on black, white, saturated color, and checkerboard.
   Score omitted subject parts, background leakage, fine edges, transparency,
   and color fringes separately. For genuine ground-truth alpha, record MAE,
   SAD, gradient, and connectivity errors at original dimensions. A generated
   edit or an attractive demo image is not ground truth.
5. Measure at least ten warm complete requests per finalist, plus at least three
   cold requests after **observing zero containers**. Report sample count,
   individual cold results, median/range, failures, output correctness, bytes,
   timing stages, and peak host/GPU memory. Such a small cold sample does not
   support a production p95 claim. Keep RTX 4090, the verified production CPU
   allocation, 8 GiB host RAM,
   checkpoint warmup, 60-second idle window, and concurrency fixed.
6. Compare cost per successful image for the observed arrival pattern, including
   paid idle time. A model that runs faster when warm can still cost more if its
   checkpoint restores slowly or its larger outputs dominate the request.

Promote only a repeatable quality improvement on the failing images with no
material regression in the other categories and acceptable measured cold/warm
behavior. Any model switch still follows the
[checkpoint rollout procedure](checkpoint-production-rollout.md). Until then,
the justified change is preserving upload detail; the replacement model remains
an experiment.
