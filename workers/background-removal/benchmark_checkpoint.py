"""Isolated checkpoint experiments. Stop these deployments after benchmarking."""
from pathlib import Path
from beam import endpoint, Image, QueueDepthAutoscaler, Volume
from app import load_model, load_warmed_model, remove_background


@endpoint(
    name="bg-removal-checkpoint-benchmark",
    cpu=2,
    memory="8Gi",
    gpu="RTX4090",
    image=Image(python_version="python3.12").add_python_packages(
        Path(__file__).with_name("requirements-gpu.txt").read_text().splitlines()
    ),
    volumes=[Volume(name="model_cache", mount_path="./model_cache")],
    on_start=load_model,
    checkpoint_enabled=True,
    keep_warm_seconds=60,
    autoscaler=QueueDepthAutoscaler(min_containers=0, max_containers=1),
    timeout=180,
)
def checkpoint_benchmark(context, **inputs):
    return remove_background.local(context, **inputs)


@endpoint(
    name="bg-removal-control-benchmark",
    cpu=2,
    memory="8Gi",
    gpu="RTX4090",
    image=Image(python_version="python3.12").add_python_packages(
        Path(__file__).with_name("requirements-gpu.txt").read_text().splitlines()
    ),
    volumes=[Volume(name="model_cache", mount_path="./model_cache")],
    on_start=load_model,
    checkpoint_enabled=False,
    keep_warm_seconds=60,
    autoscaler=QueueDepthAutoscaler(min_containers=0, max_containers=1),
    timeout=180,
)
def control_benchmark(context, **inputs):
    return remove_background.local(context, **inputs)


@endpoint(
    name="bg-removal-warmed-checkpoint-benchmark",
    cpu=2,
    memory="8Gi",
    gpu="RTX4090",
    image=Image(python_version="python3.12").add_python_packages(
        Path(__file__).with_name("requirements-gpu.txt").read_text().splitlines()
    ),
    volumes=[Volume(name="model_cache", mount_path="./model_cache")],
    on_start=load_warmed_model,
    checkpoint_enabled=True,
    keep_warm_seconds=60,
    autoscaler=QueueDepthAutoscaler(min_containers=0, max_containers=1),
    timeout=180,
)
def warmed_checkpoint_benchmark(context, **inputs):
    return remove_background.local(context, **inputs)
