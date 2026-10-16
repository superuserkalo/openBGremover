"""Reproducible bytes-in/bytes-out Pillow/libvips comparison. No production imports."""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import io
import json
import math
import os
from pathlib import Path
import platform
import random
import resource
import statistics
import subprocess
import sys
import time

# Request concurrency one before native imports; helper threads can still run.
for variable in ("VIPS_CONCURRENCY", "OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS"):
    os.environ[variable] = "1"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def prepare(root: Path) -> None:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont, ImageOps

    fixtures = root / "fixtures"
    fixtures.mkdir(exist_ok=True)
    manifest = []
    for label, size in [("small", (512, 384)), ("medium", (1600, 1200)), ("large", (4000, 3000))]:
        width, height = size
        for kind in ("landscape", "bird", "text", "alpha"):
            if kind in ("landscape", "bird"):
                image = ImageOps.fit(Image.open(root / "sources" / f"{kind}.jpg").convert("RGB"), size, method=Image.Resampling.LANCZOS)
                native = "jpeg"
            elif kind == "text":
                image = Image.new("RGB", size, "#faf9f6")
                draw = ImageDraw.Draw(image)
                font = ImageFont.load_default(size=max(12, width // 80))
                for y in range(10, height, max(24, width // 35)):
                    draw.text((10, y), "Invoice 00482 | EUR 1,249.99 | Compression ABC abc 0123456789", fill="#172c40", font=font)
                    draw.line((10, y + max(18, width // 48), width - 10, y + max(18, width // 48)), fill="#64798f", width=1)
                for index, color in enumerate(("#ff5522", "#2266ff", "#23ad73", "#e9bb20")):
                    x = int(width * (0.12 + 0.2 * index))
                    draw.rectangle((x, height // 3, x + width // 9, height // 2), fill=color)
                native = "png"
            else:
                yy, xx = np.mgrid[0:height, 0:width]
                x, y = xx / width, yy / height
                alpha = np.clip((0.44 - np.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2)) * 1600, 0, 255).astype("uint8")
                rgb = np.stack(((x * 255).astype("uint8"), (y * 255).astype("uint8"), ((0.5 + 0.5 * np.sin(x * 120)) * 255).astype("uint8")), axis=2)
                rgb[alpha == 0] = 0
                image = Image.fromarray(np.dstack((rgb, alpha)), "RGBA")
                native = "png"
            formats = ("jpeg", "png", "webp", "avif", "gif") if label == "medium" else (native,)
            for fmt in formats:
                value = image
                if fmt in ("jpeg", "gif") and image.mode == "RGBA":
                    value = Image.new("RGB", size, "white")
                    value.paste(image, mask=image.getchannel("A"))
                options = {
                    "jpeg": {"quality": 95, "subsampling": 0},
                    "png": {"compress_level": 6},
                    "webp": {"lossless": True, "method": 4, "exact": True},
                    "avif": {"quality": 90, "speed": 8, "subsampling": "4:4:4", "max_threads": 1},
                    "gif": {},
                }[fmt]
                path = fixtures / f"{kind}-{label}.{fmt}"
                value.save(path, fmt.upper(), **options)
                data = path.read_bytes()
                manifest.append({"path": str(path.relative_to(root)), "kind": kind, "size": label, "width": width, "height": height, "format": fmt, "native": fmt == native, "bytes": len(data), "sha256": digest(data), "under_10mib": len(data) <= 10 * 1024 * 1024, "upsampled_source": kind == "bird" and label == "large"})
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps({"fixtures": len(manifest), "bytes": sum(x["bytes"] for x in manifest)}), flush=True)


def processor(engine: str):
    if engine == "pillow":
        from PIL import Image, ImageOps

        def process(raw: bytes, case: dict) -> bytes:
            image = ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
            image.load()
            image = image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
            if case["format"] == "jpeg" and image.mode == "RGBA":
                flat = Image.new("RGB", image.size, "white")
                flat.paste(image, mask=image.getchannel("A"))
                image = flat
            image.info.clear()
            options = {
                "png": {"compress_level": case.get("level", 6)},
                "jpeg": {"quality": case.get("quality", 80), "subsampling": 2, "optimize": True, "progressive": False},
                "webp": {"quality": case.get("quality", 80), "method": 4, "lossless": case.get("lossless", False), "exact": True},
                "avif": {"quality": case.get("quality", 50), "speed": 6, "subsampling": "4:2:0", "max_threads": 1, "codec": "aom"},
            }[case["format"]]
            output = io.BytesIO()
            image.save(output, case["format"].upper(), **options)
            return output.getvalue()
        return process

    import pyvips
    pyvips.cache_set_max(0)

    def process(raw: bytes, case: dict) -> bytes:
        image = pyvips.Image.new_from_buffer(raw, "", access="sequential").autorot()
        if image.interpretation not in ("srgb", "rgb"):
            image = image.colourspace("srgb")
        if case["format"] == "jpeg" and image.hasalpha():
            image = image.flatten(background=[255, 255, 255])
        fmt = case["format"]
        if fmt == "png":
            return image.pngsave_buffer(compression=case.get("level", 6), filter=248, palette=False, strip=True)
        if fmt == "jpeg":
            return image.jpegsave_buffer(Q=case.get("quality", 80), subsample_mode="on", optimize_coding=True, interlace=False, strip=True)
        if fmt == "webp":
            return image.webpsave_buffer(Q=case.get("quality", 80), effort=4, lossless=case.get("lossless", False), exact=True, alpha_q=100, strip=True)
        return image.heifsave_buffer(Q=case.get("quality", 50), compression="av1", encoder="aom", speed=6, bitdepth=8, subsample_mode="on", strip=True)
    return process


def worker(engine: str, source: Path, case: dict, destination: Path, repeats: int) -> dict:
    started = time.perf_counter()
    process = processor(engine)
    import_ms = (time.perf_counter() - started) * 1000
    raw = source.read_bytes()
    started = time.perf_counter()
    output = process(raw, case)
    first_ms = (time.perf_counter() - started) * 1000
    samples = []
    cpu_samples = []
    hashes = {digest(output)}
    for _ in range(repeats):
        started = time.perf_counter()
        cpu_started = time.process_time()
        output = process(raw, case)
        cpu_samples.append((time.process_time() - cpu_started) * 1000)
        samples.append((time.perf_counter() - started) * 1000)
        hashes.add(digest(output))
    destination.write_bytes(output)
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return {"engine": engine, "import_ms": import_ms, "first_ms": first_ms, "samples_ms": samples, "cpu_samples_ms": cpu_samples, "median_ms": statistics.median(samples) if samples else first_ms, "bytes": len(output), "sha256": digest(output), "stable_hashes": len(hashes) == 1, "peak_rss_mib": rss / (1024 * 1024 if sys.platform == "darwin" else 1024)}


def quality(source: Path, output: Path, fmt: str) -> dict:
    import numpy as np
    from PIL import Image, ImageOps
    from skimage.metrics import structural_similarity

    reference = ImageOps.exif_transpose(Image.open(source)).convert("RGBA")
    result = Image.open(output).convert("RGBA")
    if reference.size != result.size:
        return {"dimensions_ok": False}
    a, b = np.asarray(reference), np.asarray(result)
    alpha_error = int(np.max(np.abs(a[:, :, 3].astype("int16") - b[:, :, 3].astype("int16")))) if fmt != "jpeg" else None
    sse = 0.0
    maximum = 0
    pixels = reference.width * reference.height
    # Full-resolution RGB error over white; alpha error is reported separately.
    for y in range(0, reference.height, 128):
        ar = a[y:y + 128].astype("float32")
        br = b[y:y + 128].astype("float32")
        ar = ar[:, :, :3] * (ar[:, :, 3:4] / 255) + 255 - ar[:, :, 3:4]
        br = br[:, :, :3] * (br[:, :, 3:4] / 255) + 255 - br[:, :, 3:4]
        difference = ar - br
        sse += float(np.sum(difference * difference, dtype="float64"))
        maximum = max(maximum, float(np.max(np.abs(difference))))
    mse = sse / (pixels * 3)
    # Three fixed full-resolution crops; no thumbnail downsampling hides text artifacts.
    scores = []
    edge = min(384, reference.width, reference.height)
    for fx, fy in ((0, 0), (0.5, 0.5), (1, 1)):
        x, y = int((reference.width - edge) * fx), int((reference.height - edge) * fy)
        box = (x, y, x + edge, y + edge)
        crops = []
        for im in (reference, result):
            crop = im.crop(box)
            flat = Image.new("RGB", crop.size, "white")
            flat.paste(crop, mask=crop.getchannel("A"))
            crops.append(np.asarray(flat))
        scores.append(float(structural_similarity(crops[0], crops[1], channel_axis=2, data_range=255)))
    return {"dimensions_ok": True, "exact_rgba": bool(np.array_equal(a, b)), "max_visible_error": maximum, "alpha_max_error": alpha_error, "psnr_rgb_white_db": None if mse == 0 else 10 * math.log10(255**2 / mse), "ssim_3crops_rgb_white": statistics.mean(scores)}


def cases_for(manifest: list[dict]) -> list[dict]:
    cases = []
    profiles = [("png-fast", {"format": "png", "level": 3}), ("png-small", {"format": "png", "level": 6}), ("jpeg", {"format": "jpeg", "quality": 80}), ("webp", {"format": "webp", "quality": 80}), ("webp-lossless", {"format": "webp", "quality": 80, "lossless": True}), ("avif", {"format": "avif", "quality": 50})]
    for item in manifest:
        if item["native"]:
            for name, options in profiles:
                cases.append({**item, **options, "group": "main", "profile": name})
            if item["size"] == "medium":
                for fmt, values in [("jpeg", (50, 65, 90, 95)), ("webp", (50, 65, 90, 95)), ("avif", (30, 40, 65, 80))]:
                    for q in values:
                        cases.append({**item, "format": fmt, "quality": q, "group": "quality-sweep", "profile": f"{fmt}-q{q}"})
        elif item["size"] == "medium":
            cases.append({**item, "format": "png", "level": 6, "group": "input-formats", "profile": f"{item['format']}-to-png"})
    for index, case in enumerate(cases):
        case["id"] = f"{index:03}-{case['kind']}-{case['size']}-{case['profile']}"
    return cases


def run(root: Path, smoke: bool) -> None:
    from PIL import features
    import pyvips
    outputs = root / "outputs"
    outputs.mkdir(exist_ok=True)
    manifest = json.loads((root / "manifest.json").read_text())
    cases = cases_for(manifest)
    if smoke:
        cases = [x for x in cases if x["kind"] == "alpha" and x["size"] == "small"]
    random.Random(20261015).shuffle(cases)
    environment = {"platform": platform.platform(), "machine": platform.machine(), "python": sys.version, "cpu_count": os.cpu_count(), "versions": {name: importlib.metadata.version(name) for name in ("pillow", "pyvips", "pyvips-binary", "numpy", "scikit-image", "psutil")}, "pillow_features": {name: features.version(name) for name in features.get_supported()}, "libvips": '.'.join(str(pyvips.version(i)) for i in range(3)), "pyvips_api_mode": pyvips.API_mode, "threads": 1, "vips_cache_max": 0}
    for name, path in [("cpuinfo", "/proc/cpuinfo"), ("cpu_max", "/sys/fs/cgroup/cpu.max"), ("memory_max", "/sys/fs/cgroup/memory.max")]:
        if Path(path).exists():
            environment[name] = Path(path).read_text()[:1500]
    (root / "environment.json").write_text(json.dumps(environment, indent=2))
    results = []
    for index, case in enumerate(cases):
        order = ("pillow", "vips") if index % 2 == 0 else ("vips", "pillow")
        for engine in order:
            destination = outputs / f"{case['id']}-{engine}.{case['format']}"
            command = [sys.executable, str(Path(__file__).resolve()), "worker", "--engine", engine, "--source", str(root / case["path"]), "--case", json.dumps(case), "--destination", str(destination), "--repeats", str(1 if smoke else 5)]
            started = time.perf_counter()
            response = subprocess.run(command, text=True, capture_output=True, timeout=180)
            elapsed = (time.perf_counter() - started) * 1000
            row = {"case": case, "engine": engine, "process_total_ms": elapsed}
            if response.returncode:
                row["error"] = response.stderr[-3000:]
            else:
                row.update(json.loads(response.stdout))
                row["quality"] = quality(root / case["path"], destination, case["format"])
            results.append(row)
            with (root / "results.jsonl").open("a") as handle:
                handle.write(json.dumps(row) + "\n")
        print(json.dumps({"completed": index + 1, "total": len(cases), "case": case["id"], "errors": sum("error" in r for r in results)}), flush=True)
    (root / "results.json").write_text(json.dumps(results, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["prepare", "run", "worker"])
    parser.add_argument("--root", type=Path)
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--engine", choices=["pillow", "vips"])
    parser.add_argument("--source", type=Path)
    parser.add_argument("--destination", type=Path)
    parser.add_argument("--case")
    parser.add_argument("--repeats", type=int, default=5)
    args = parser.parse_args()
    if args.action == "prepare":
        prepare(args.root.resolve())
    elif args.action == "run":
        run(args.root.resolve(), args.smoke)
    else:
        print(json.dumps(worker(args.engine, args.source, json.loads(args.case), args.destination, args.repeats)))


if __name__ == "__main__":
    main()
