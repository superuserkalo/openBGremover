"""Beam deployment and BiRefNet inference. Image handling lives in imaging.py."""
import json
import time
from pathlib import Path
from beam import endpoint, Image, env, Volume

MODEL_ID = "ZhengPeng7/BiRefNet_HR-matting"
MODEL_REVISION = "5d6b6f8adcb5b417c871b1d84ceaae9871355b7f"


def log_timing(event, **fields):
    print(json.dumps({"event": event, "timestamp": time.time(), **fields}), flush=True)


if env.is_remote():
    imports_started = time.monotonic()
    log_timing("imports_started")
    import torch
    from transformers import AutoModelForImageSegmentation
    from torchvision import transforms
    from fastapi.responses import Response
    from imaging import process_image
    log_timing("imports_finished", duration_ms=round((time.monotonic() - imports_started) * 1000))


def load_model():
    started = time.monotonic()
    log_timing("model_load_started")
    model = AutoModelForImageSegmentation.from_pretrained(
        MODEL_ID, revision=MODEL_REVISION, trust_remote_code=True, cache_dir="./model_cache"
    )
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.set_float32_matmul_precision("highest")
    model.to(device).eval()
    if device.type == "cuda":
        model.half()
    transform = transforms.Compose([
        transforms.Resize((2048, 2048), antialias=True),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    log_timing("model_ready", duration_ms=round((time.monotonic() - started) * 1000))
    return model, transform, device


def load_warmed_model():
    model, transform, device = load_model()
    started = time.monotonic()
    sample = torch.zeros((1, 3, 2048, 2048), device=device, dtype=next(model.parameters()).dtype)
    with torch.inference_mode():
        prediction = model(sample)[-1].sigmoid().float().cpu()
    # Keep initialized kernels, but exclude unused activation allocations from the snapshot.
    del prediction, sample
    torch.cuda.empty_cache()
    log_timing("model_warmup_finished", duration_ms=round((time.monotonic() - started) * 1000))
    return model, transform, device


@endpoint(
    name="bg-removal",
    cpu=1,
    memory="8Gi",
    gpu="RTX4090",
    image=Image(python_version="python3.12").add_python_packages(
        Path(__file__).with_name("requirements-gpu.txt").read_text().splitlines()
    ),
    volumes=[Volume(name="model_cache", mount_path="./model_cache")],
    on_start=load_warmed_model,
    checkpoint_enabled=True,
    keep_warm_seconds=60,
    max_pending_tasks=100,
    timeout=180,
)
def remove_background(context, **inputs):
    started = time.monotonic()
    log_timing("request_started", task_id=context.task_id)
    model, transform, device = context.on_start_value

    def infer_mask(image):
        tensor = transform(image).unsqueeze(0).to(device)
        if device.type == "cuda":
            tensor = tensor.half()
        inference_started = time.monotonic()
        log_timing("inference_started", task_id=context.task_id,
                   request_elapsed_ms=round((inference_started - started) * 1000))
        with torch.inference_mode():
            prediction = model(tensor)[-1].sigmoid().float().cpu()[0].squeeze()
        log_timing("inference_finished", task_id=context.task_id,
                   duration_ms=round((time.monotonic() - inference_started) * 1000))
        # Preserve soft alpha; thresholding destroys hair and translucent edges.
        return transforms.ToPILImage()(prediction)

    try:
        binary = inputs.get("response_format") == "binary" and not inputs.get("return_mask", False)
        result = process_image(
            inputs["image"], infer_mask, inputs.get("format", "png"),
            inputs.get("resize"), inputs.get("return_mask", False),
            binary=binary,
            record_timing=lambda stage, duration: log_timing(stage, task_id=context.task_id, duration_ms=duration),
        )
        result["metadata"].update({
            "processing_time_ms": round((time.monotonic() - started) * 1000),
            "model": MODEL_ID, "model_revision": MODEL_REVISION, "device": str(device),
            # Historical quality names remain aliases of this model's matting output.
            "quality_used": inputs.get("quality", "auto"),
        })
        if binary:
            extension = result["metadata"]["format"]
            if extension == "jpg":
                extension = "jpeg"
            return Response(result["image"], media_type=f"image/{extension}", headers={
                "X-Image-Metadata": json.dumps(result["metadata"], separators=(",", ":")),
                "X-Task-Id": context.task_id,
                "Cache-Control": "no-store",
            })
        return result
    except (KeyError, ValueError, OSError) as error:
        return {"success": False, "error": str(error), "code": "INVALID_IMAGE"}
    except Exception:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": "Image processing failed", "code": "PROCESSING_ERROR"}
    finally:
        log_timing("request_finished", task_id=context.task_id,
                   duration_ms=round((time.monotonic() - started) * 1000))
