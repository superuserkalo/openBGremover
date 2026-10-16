"""Run only from a staging directory containing bench.py, fixtures and manifest."""
import base64
import io
import json
from pathlib import Path
import time
import zipfile

from beam import Image, function


@function(
    name="image-libraries-benchmark-20261015",
    cpu=1,
    memory="8Gi",
    retries=0,
    timeout=1800,
    image=Image(python_version="python3.12").add_python_packages(
        Path(__file__).with_name("requirements.txt").read_text().splitlines()
    ),
)
def compare():
    import os
    import subprocess
    import sys
    from PIL import Image as PILImage, ImageDraw

    root = Path.cwd()
    started = time.monotonic()
    subprocess.run([sys.executable, "bench.py", "run", "--root", str(root)], check=True)
    results = json.loads((root / "results.json").read_text())
    review = []
    seen = set()
    for row in results:
        case = row["case"]
        if case["group"] != "main" or case["size"] != "medium" or case["profile"] not in ("jpeg", "webp", "avif") or case["id"] in seen:
            continue
        seen.add(case["id"])
        paths = [root / case["path"]] + [root / "outputs" / f"{case['id']}-{engine}.{case['format']}" for engine in ("pillow", "vips")]
        if not all(path.exists() for path in paths):
            continue
        canvas = PILImage.new("RGB", (1152, 422), "white")
        draw = ImageDraw.Draw(canvas)
        for index, (label, path) in enumerate(zip(("Reference", "Pillow", "libvips"), paths)):
            im = PILImage.open(path).convert("RGBA")
            x, y = ((0, 0) if case["kind"] == "text" else ((im.width - 384) // 2, (im.height - 384) // 2))
            crop = im.crop((x, y, x + 384, y + 384))
            canvas.paste(crop, (index * 384, 38), crop)
            draw.text((index * 384 + 6, 8), f"{case['kind']} / {case['profile']} / {label}", fill="black")
        path = root / f"review-{case['kind']}-{case['profile']}.png"
        canvas.save(path)
        review.append(path)
    task = {"elapsed_seconds": time.monotonic() - started, "task_id": os.getenv("TASK_ID"), "cpu": 1, "memory_gib": 8, "gpu": None}
    (root / "task-measurement.json").write_text(json.dumps(task, indent=2))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in [root / "results.json", root / "results.jsonl", root / "environment.json", root / "manifest.json", root / "task-measurement.json", *review]:
            archive.write(path, path.name)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


if __name__ == "__main__":
    result = compare.remote()
    Path("result-bundle.zip").write_bytes(base64.b64decode(result))
    print("Saved result-bundle.zip", flush=True)
