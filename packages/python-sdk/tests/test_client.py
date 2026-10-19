import base64
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from openbg import OpenBG, OpenBGError


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.status = 200
        self.payload = {"success": True, "result_image": base64.b64encode(b"output").decode(),
                        "processing_time_ms": 12, "metadata": {"format": "png"}}
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                owner.assertEqual(self.headers["User-Agent"], "openbg-py/0.1.0")
                owner.requests.append((self.path, self.headers["Authorization"],
                                       json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
                self.send_response(owner.status)
                self.end_headers()
                self.wfile.write(json.dumps(owner.payload).encode())

            def log_message(self, *_args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.app = OpenBG(api_key="bg-test", base_url=f"http://127.0.0.1:{self.server.server_port}")

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def test_file_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "input.png"
            source.write_bytes(b"original")
            result = self.app.remove_background(source)
            output = Path(directory) / "output.png"
            result.save(output)
            self.assertEqual(output.read_bytes(), b"output")
        path, authorization, body = self.requests[0]
        self.assertEqual(path, "/api/v1/remove-background")
        self.assertEqual(authorization, "Bearer bg-test")
        self.assertEqual(base64.b64decode(body["image_data"]), b"original")

    def test_http_error_without_retry(self):
        self.status = 429
        self.payload = {"error": "Rate limited", "error_code": "RATE_LIMITED"}
        with self.assertRaises(OpenBGError) as failure:
            self.app.remove_background(b"input")
        self.assertEqual(failure.exception.status, 429)
        self.assertEqual(failure.exception.code, "RATE_LIMITED")
        self.assertEqual(len(self.requests), 1)

    def test_malformed_response(self):
        self.payload = {"success": True}
        with self.assertRaises(OpenBGError) as failure:
            self.app.remove_background(b"input")
        self.assertEqual(failure.exception.code, "INVALID_RESPONSE")

    def test_invalid_input_never_sent(self):
        with self.assertRaises(OpenBGError):
            self.app.remove_background(b"")
        self.assertEqual(self.requests, [])

    def transform_payload(self, operation):
        self.payload["metadata"] = {
            "operation": operation, "format": "webp", "original_size": [2, 2], "output_size": [2, 2],
            "input_bytes": 10, "output_bytes": 6, "bytes_saved": 4, "retained_original": False,
            "quality_used": "73", "lossless": False,
        }

    def test_transform_defaults_and_every_override(self):
        self.transform_payload("compress-image")
        result = self.app.compress_image(b"input")
        self.assertEqual(result.image, b"output")
        self.assertEqual(result.metadata.bytes_saved, 4)
        self.assertEqual(self.requests[-1][0], "/api/v1/compress-image")
        self.assertEqual(self.requests[-1][2], {"image_data": "aW5wdXQ="})
        self.app.compress_image(b"input", compression_level=0)
        self.assertEqual(self.requests[-1][2]["compression_level"], 0)
        self.transform_payload("convert-image")
        self.app.convert_image(b"input", format="webp")
        self.assertEqual(self.requests[-1][0], "/api/v1/convert-image")
        self.assertEqual(self.requests[-1][2], {"image_data": "aW5wdXQ=", "format": "webp"})
        for lossless in (True, False):
            self.app.convert_image(b"input", format="webp", quality=73, lossless=lossless)
            self.assertEqual(self.requests[-1][2], {"image_data": "aW5wdXQ=", "format": "webp",
                                                  "quality": 73, "lossless": lossless})
        self.app.convert_image(b"input", format="png", compression_level=9)
        self.assertEqual(self.requests[-1][2]["compression_level"], 9)
        self.payload["metadata"].update(format="avif", encoder="libavif", quality_used="40")
        result = self.app.convert_image(b"input", format="avif", quality=40)
        self.assertEqual(self.requests[-1][2], {"image_data": "aW5wdXQ=", "format": "avif", "quality": 40})
        self.assertEqual((result.format, result.metadata.encoder), ("avif", "libavif"))

    def test_background_defaults_are_omitted_and_resize_is_available(self):
        self.app.remove_background(b"input")
        self.assertEqual(self.requests[-1][2], {"image_data": "aW5wdXQ="})
        self.app.remove_background(b"input", format="webp", quality="quality", return_mask=False,
                                   resize_options={"max_width": 400, "keep_aspect": True})
        self.assertEqual(self.requests[-1][2], {"image_data": "aW5wdXQ=", "format": "webp",
                         "quality": "quality", "return_mask": False,
                         "resize_options": {"max_width": 400, "keep_aspect": True}})

    def test_invalid_transform_overrides_never_sent(self):
        for options in [{"quality": 0}, {"quality": True}, {"quality": 1.5},
                        {"compression_level": 10}, {"lossless": "true"}]:
            with self.assertRaises(ValueError):
                self.app.compress_image(b"input", **options)
        with self.assertRaises(ValueError):
            self.app.convert_image(b"input", format="gif")
        with self.assertRaises(OpenBGError):
            self.app.convert_image(b"", format="png")
        self.assertEqual(self.requests, [])

    def test_invalid_transform_response(self):
        for field, value in [("operation", "compress-image"), ("output_bytes", 99),
                             ("original_size", [1]), ("retained_original", 1)]:
            self.transform_payload("convert-image")
            self.payload["metadata"][field] = value
            with self.assertRaises(OpenBGError) as failure:
                self.app.convert_image(b"input", format="webp")
            self.assertEqual(failure.exception.code, "INVALID_RESPONSE")

    def test_transform_failures_are_not_retried(self):
        self.status = 402
        self.payload = {"error": "No credits", "error_code": "INSUFFICIENT_CREDITS"}
        with self.assertRaises(OpenBGError) as failure:
            self.app.compress_image(b"input")
        self.assertEqual(failure.exception.code, "INSUFFICIENT_CREDITS")
        with self.assertRaises(OpenBGError):
            self.app.convert_image(b"input", format="png")
        self.assertEqual(len(self.requests), 2)


if __name__ == "__main__":
    unittest.main()
