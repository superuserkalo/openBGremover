"""CPU-only Beam image operations. The public authenticated API owns accounting."""
import json
import tempfile
from pathlib import Path

from beam import Image, Output, TaskPolicy, endpoint


@endpoint(
    name="image-processing",
    cpu=1,
    memory="8Gi",
    image=Image(python_version="python3.12").add_python_packages(
        Path(__file__).with_name("requirements.txt").read_text().splitlines()
    ),
    keep_warm_seconds=60,
    task_policy=TaskPolicy(max_retries=0),
    authorized=True,
    timeout=60,
    max_pending_tasks=100,
)
def process_image(context, **inputs):
    from fastapi.responses import Response
    from PIL import Image as PillowImage
    from imaging import transform_image

    try:
        if set(inputs) - {"image_data", "operation", "format", "quality", "lossless", "compression_level"}:
            raise ValueError("Unsupported image option")
        encoded, metadata = transform_image(**inputs)
    except (ValueError, TypeError, OSError, KeyError, PillowImage.DecompressionBombError):
        return Response(json.dumps({"success": False, "error": "Invalid image or encoding options"}),
                        status_code=400, media_type="application/json")

    # Delivery failures must remain server errors, not be reported as bad user images.
    extension = metadata["format"]
    with tempfile.NamedTemporaryFile(suffix="." + extension) as file:
        file.write(encoded)
        file.flush()
        url = Output(path=file.name).save().public_url(expires=120)
    return Response(
        json.dumps({"url": url, "content_type": f"image/{extension}", "metadata": metadata}),
        media_type="application/vnd.openbg.file+json",
        headers={"Cache-Control": "no-store", "X-Task-Id": context.task_id},
    )
