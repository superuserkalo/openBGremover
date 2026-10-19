# libvips image worker and cutout PNG rollout

Deployed on 19 October 2026 after explicit authorization. Two worker changes
went live through one Cloudflare API deployment:

- **Image processing v3**: libvips decoding and encoding (MozJPEG, libpng,
  libwebp), standalone pillow-heif HEIC input, and Pillow/libavif AVIF output.
  See [image processing](image-processing.md).
- **Background removal v20**: RGB cleared under fully transparent pixels and
  imagecodecs lossless PNG throughout, including the earlier unpromoted
  [PNG speed-up](png-encoding-browser-validation.md). See
  [background-removal PNG output](background-removal-png-output.md).

## Versions

| Component | Version |
| --- | --- |
| Cloudflare API | `e7085675-6e8e-4c2b-985d-992cfb605971` |
| Background removal | `bg-removal` v20, deployment `47c5c5c8-547b-4156-9144-b94d4dd7ec2f`, stub `6811a085-a896-4930-87a6-4eca6b3b071b` |
| Image processing | `image-processing` v3, deployment `3450ade7-0287-4462-842c-a6c2da4f0013`, endpoint `https://image-processing-e41046c-v3.app.beam.cloud` |
| Legacy Cloud Run | **Still on v18** (`openbgremover-00044-gw6`) |

Configuration is unchanged: one CPU and 8 GiB on both workers; RTX 4090,
warmed checkpoint, 60-second idle window, and scale-to-zero on the GPU worker.

## Verification

**Direct preflight, image processing v3** (Beam, before the API switch):

| Case | Result |
| --- | --- |
| PNG text graphic → AVIF | 13,434 B, `libavif`, quality 60 |
| 12 MP JPEG compression | 1,298,594 B, `mozjpeg`, 3.49 MB saved |
| HEIC with stored rotation and P3 ICC → JPEG | Upright 1200×1600, ICC kept |
| HEIC compression | HTTP 400 |

**Direct preflight, background removal v20.** The checkpoint (1.70 GiB) was
captured before the switch. A 512×512 PNG and a 12 MP JPEG returned PNG file
output and JSON with masks on CUDA. Soft alpha was retained, and no RGB value
was non-zero under any fully transparent pixel. The 12 MP result was 0.88 MiB.

**One cold sample**, after observing zero v20 containers: 4.6 s for the complete
direct response, and the checkpoint restored in 2.496 s. That is consistent
with earlier cold results, but it is a single sample, not a latency
comparison.

**Live production E2E**, run against the deployed Cloudflare API. Both runs
passed every stage:

- **Default run:** 8 stages.
- **`E2E_IMAGE_OPERATIONS=1`:** 9 stages. It covered login, keys and scopes,
  GPU PNG and mask output, and conversion and compression for JPEG, PNG,
  WebP, and AVIF. It also covered HEIC-to-JPEG conversion, rejection of HEIC
  compression before a credit is charged, exactly 12 charges, invalid input,
  a refund after a real worker failure, and key revocation.

After the runs, users and profiles were back to 89 each, the count before
them. No test accounts were left.

**Local:** strict TypeScript, Oxlint, 177 TypeScript tests with the real
Python worker integration, 18 CPU worker tests, 10 background-removal tests,
9 Python SDK tests, the website build, and the API dry-run build.

Not done:

- No browser click-through of the website.
- No controlled cold or warm latency comparison.
- No visual quality study of the new encoders.

## Rollback and remaining work

- **Image processing:** v1 (`b3f345e8-bb93-4ace-a383-aef84948a2e5`) is stopped
  and its deployment record is kept. To roll back, restart it and redeploy the
  API with its endpoint.
- **Background removal:** v18 (`e0a2747a-637d-41f9-865e-d86e25474016`) stays
  active, because the legacy Cloud Run service still calls it.
- **Whole API:** the previous version is `7f511425-9aad-4d83-844a-68d78cadd343`.
- **Cloud Run:** switching it to v20 was not authorized in this session. After
  that switch and a smoke check, stop v18.

Private deployment logs are under ignored
`artifacts/deployments/libvips-2026-10-19/`.
