"""Summarize saved measurements; does not run or retry image processing."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import statistics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    rows = json.loads((args.root / "results.json").read_text())
    failures = [row for row in rows if "error" in row]
    good = [row for row in rows if "error" not in row]
    pairs = {}
    for row in good:
        pairs.setdefault(row["case"]["id"], {})[row["engine"]] = row
    paired = [pair for pair in pairs.values() if len(pair) == 2]
    print(f"Rows: {len(rows)}; failures: {len(failures)}; complete pairs: {len(paired)}")
    print(f"Measured transformations: {sum(1 + len(row['samples_ms']) for row in good)}")
    print(f"Dimension failures: {sum(not row['quality']['dimensions_ok'] for row in good)}")
    print(f"Nondeterministic outputs: {sum(not row['stable_hashes'] for row in good)}")
    for engine in ("pillow", "vips"):
        chosen = [row for row in good if row["engine"] == engine]
        print(engine, "import median ms", round(statistics.median(row["import_ms"] for row in chosen), 2),
              "raw ru_maxrss MiB (may include inherited high-water floor)", round(max(row["peak_rss_mib"] for row in chosen), 1))

    print("\n| Profile | MP | Pillow ms | libvips ms | libvips time delta | Pillow KiB | libvips KiB | Byte delta |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for profile in ("png-fast", "png-small", "jpeg", "webp", "webp-lossless", "avif"):
        for size, mp in (("small", 0.20), ("medium", 1.92), ("large", 12)):
            subset = [pair for pair in paired if pair["pillow"]["case"]["group"] == "main" and pair["pillow"]["case"]["profile"] == profile and pair["pillow"]["case"]["size"] == size]
            times = [statistics.median(pair[e]["median_ms"] for pair in subset) for e in ("pillow", "vips")]
            sizes = [statistics.median(pair[e]["bytes"] for pair in subset) / 1024 for e in ("pillow", "vips")]
            delta = statistics.median(pair["vips"]["median_ms"] / pair["pillow"]["median_ms"] - 1 for pair in subset) * 100
            byte_delta = statistics.median(pair["vips"]["bytes"] / pair["pillow"]["bytes"] - 1 for pair in subset) * 100
            print(f"| {profile} | {mp:.2f} | {times[0]:.1f} | {times[1]:.1f} | {delta:+.1f}% | {sizes[0]:.1f} | {sizes[1]:.1f} | {byte_delta:+.2f}% |")

    print("\nQuality differences across main and sweep profiles, libvips minus Pillow:")
    for fmt in ("png", "jpeg", "webp", "avif"):
        subset = [pair for pair in paired if pair["pillow"]["case"]["format"] == fmt]
        deltas = [pair["vips"]["quality"]["ssim_3crops_rgb_white"] - pair["pillow"]["quality"]["ssim_3crops_rgb_white"] for pair in subset]
        sizes = [100 * (pair["vips"]["bytes"] / pair["pillow"]["bytes"] - 1) for pair in subset]
        print(fmt, "pairs", len(subset), "identical files", sum(p['pillow']['sha256'] == p['vips']['sha256'] for p in subset), "SSIM delta min/median/max", [round(x, 6) for x in (min(deltas), statistics.median(deltas), max(deltas))], "byte delta % min/median/max", [round(x, 3) for x in (min(sizes), statistics.median(sizes), max(sizes))])

    print("\nMain-profile cases meeting the predeclared latency threshold, before quality/size assessment:")
    for pair in paired:
        p, v = pair["pillow"], pair["vips"]
        if p["case"]["group"] == "main" and v["median_ms"] <= 0.75 * p["median_ms"] and p["median_ms"] - v["median_ms"] >= 50:
            print(p["case"]["id"], "ms", round(p["median_ms"], 1), round(v["median_ms"], 1), "bytes", p["bytes"], v["bytes"], "SSIM", round(p["quality"]["ssim_3crops_rgb_white"], 5), round(v["quality"]["ssim_3crops_rgb_white"], 5))

    with (args.root / "measurements.csv").open("w", newline="") as handle:
        fields = ["id", "group", "kind", "size", "input", "profile", "engine", "ms", "first_ms", "import_ms", "cpu_ms", "rss_mib", "bytes", "source_bytes", "psnr", "ssim", "alpha_max_error", "exact_rgba", "cost_per_1000_processing_usd"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in good:
            case, quality = row["case"], row["quality"]
            writer.writerow(dict(id=case["id"], group=case["group"], kind=case["kind"], size=case["size"], input=case["path"], profile=case["profile"], engine=row["engine"], ms=row["median_ms"], first_ms=row["first_ms"], import_ms=row["import_ms"], cpu_ms=statistics.median(row["cpu_samples_ms"]), rss_mib=row["peak_rss_mib"], bytes=row["bytes"], source_bytes=case["bytes"], psnr=quality["psnr_rgb_white_db"], ssim=quality["ssim_3crops_rgb_white"], alpha_max_error=quality["alpha_max_error"], exact_rgba=quality["exact_rgba"], cost_per_1000_processing_usd=row["median_ms"] * 0.0000293))


if __name__ == "__main__":
    main()
