"""Local integration-test bridge. Uses the real CPU image pipeline, no Beam calls."""
import base64
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "workers" / "image-processing"))
from imaging import transform_image

try:
    image, metadata = transform_image(**json.load(sys.stdin))
    print(json.dumps({"status": 200, "image": base64.b64encode(image).decode(), "metadata": metadata}))
except (ValueError, TypeError, OSError):
    print(json.dumps({"status": 400}))
