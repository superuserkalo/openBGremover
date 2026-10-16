"""Temporary CPU sizing comparison. Stop both deployments after measurement."""
import time
from pathlib import Path

from beam import Image, QueueDepthAutoscaler, Volume, endpoint
from app import load_warmed_model, log_timing, remove_background


def cpu_counters():
    path = Path("/sys/fs/cgroup/cpu.stat")
    if not path.exists():
        return {}
    return {key: int(value) for key, value in
            (line.split() for line in path.read_text().splitlines())}


def cgroup_value(name):
    path = Path("/sys/fs/cgroup") / name
    return path.read_text().strip() if path.exists() else None


def measured_request(context, **inputs):
    import resource
    import torch

    before = cpu_counters()
    started = time.monotonic()
    torch.cuda.reset_peak_memory_stats()
    try:
        return remove_background.local(context, **inputs)
    finally:
        after = cpu_counters()
        log_timing(
            "benchmark_resources", task_id=context.task_id,
            elapsed_ms=round((time.monotonic() - started) * 1000),
            cpu_delta={key: value - before.get(key, value) for key, value in after.items()},
            cpu_max=cgroup_value("cpu.max"),
            memory_current=cgroup_value("memory.current"),
            memory_peak=cgroup_value("memory.peak"),
            process_max_rss_kib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            gpu_peak_allocated_bytes=torch.cuda.max_memory_allocated(),
            gpu_peak_reserved_bytes=torch.cuda.max_memory_reserved(),
            torch_threads=torch.get_num_threads(),
        )


settings = {
    "memory": "8Gi",
    "gpu": "RTX4090",
    "image": Image(python_version="python3.12").add_python_packages(
        Path(__file__).with_name("requirements-gpu.txt").read_text().splitlines()
    ),
    "volumes": [Volume(name="model_cache", mount_path="./model_cache")],
    "on_start": load_warmed_model,
    "checkpoint_enabled": True,
    "keep_warm_seconds": 60,
    "autoscaler": QueueDepthAutoscaler(min_containers=0, max_containers=1),
    "max_pending_tasks": 100,
    "timeout": 180,
}


@endpoint(name="bg-removal-cpu-one-benchmark", cpu=1, **settings)
def one_core(context, **inputs):
    return measured_request(context, **inputs)


@endpoint(name="bg-removal-cpu-two-benchmark", cpu=2, **settings)
def two_cores(context, **inputs):
    return measured_request(context, **inputs)
