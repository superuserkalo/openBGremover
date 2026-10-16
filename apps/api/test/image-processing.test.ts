import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { Schema } from "effect";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageTransformJob, ImageTransformMetadata, ImageTransformResponse } from "@openbg/contracts";
import { hashKey } from "../src/auth";
import { createDatabase } from "../src/database";
import { createHandler } from "../src/http";
import { createImageProcessor, readImageTransformRequest } from "../src/image-processing";
import { createProcessor } from "../src/media";
import { ApiError } from "../src/errors";

const USER = "00000000-0000-4000-8000-000000000001";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPQCKhoAAADBQFxDbwQswAAAABJRU5ErkJggg==";

const bytes = Buffer.from(PNG, "base64");

const sql = new PGlite();

const database = createDatabase({
  async query<Row extends object>(text: string, values?: readonly (string | number | boolean | null)[]) {
    const result = await sql.query<Row>(text, values ? [...values] : []);

    return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
  },
});

const cpu = vi.fn<typeof fetch>();

const gpu = vi.fn<typeof fetch>();

function handler(enabled = true) {
  return createHandler({
    auth: { verify: async (token) => {
      if (token !== "session") throw new ApiError({ code: "INVALID_TOKEN", message: "Invalid session", status: 401 });

      return USER;
    }, deleteUser: async () => undefined },
    withDatabase: (use) => use(database),
    process: createProcessor({ endpoint: "https://gpu.example/run", apiKey: "secret", outputUrlPrefix: "https://files.example/workspace/" }, gpu),
    processImage: enabled ? createImageProcessor({ endpoint: "https://cpu.example/run", apiKey: "secret", outputUrlPrefix: "https://files.example/workspace/" }, cpu) : undefined,
    allowedOrigins: ["https://web.example"], allowTrial: async () => true,
  });
}

function request(operation = "compress-image", body = JSON.stringify({ image_data: PNG }), token = "session", binary = false) {
  return new Request(`https://api.example/api/v1/${operation}`, {
    method: "POST", body,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: binary ? "image/*" : "application/json", Origin: "https://web.example" },
  });
}

function metadata(operation = "compress-image") {
  return { operation, format: "png", original_size: [1, 1], output_size: [1, 1], input_bytes: bytes.length, output_bytes: bytes.length, bytes_saved: 0, retained_original: operation === "compress-image" };
}

function output(operation = "compress-image") {
  return new Response(bytes, { headers: { "Content-Type": "image/png", "X-Image-Metadata": JSON.stringify(metadata(operation)) } });
}

beforeAll(async () => {
  await sql.exec(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
}, 30_000);

afterAll(() => sql.close());

beforeEach(async () => {
  await sql.exec("TRUNCATE usage_logs, api_keys, profiles RESTART IDENTITY CASCADE");
  await sql.query("INSERT INTO profiles (id, free_images_remaining, bulk_images_remaining) VALUES ($1, 1, 1)", [USER]);
  gpu.mockReset();
  cpu.mockReset();
  cpu.mockResolvedValue(output());
});

describe("image compression/conversion through the authenticated API", () => {
  it.skipIf(!process.env.IMAGE_TEST_PYTHON)("runs real Pillow conversions through routing, contracts, credit accounting, and refunds", async () => {
    const python = process.env.IMAGE_TEST_PYTHON;

    if (!python) throw new Error("Set IMAGE_TEST_PYTHON to a Python interpreter with Pillow installed");

    const script = fileURLToPath(new URL("./python-image-worker.py", import.meta.url));

    const WorkerOutput = Schema.Union([
      Schema.Struct({ status: Schema.Literal(200), image: Schema.String, metadata: ImageTransformMetadata }),
      Schema.Struct({ status: Schema.Literal(400) }),
    ]);

    cpu.mockImplementation(async (_url, init) => {
      const body = await new Response(init?.body).text();

      const stdout = await new Promise<string>((resolve, reject) => {
        const child = execFile(python, [script], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }, (error, output) => {
          if (error) reject(error);
          else resolve(output);
        });

        child.stdin?.end(body);
      });

      const result = Schema.decodeUnknownSync(WorkerOutput)(JSON.parse(stdout));

      if (result.status === 400) return new Response(null, { status: 400 });

      return new Response(Buffer.from(result.image, "base64"), { headers: { "Content-Type": `image/${result.metadata.format}`, "X-Image-Metadata": JSON.stringify(result.metadata) } });
    });
    await sql.query("UPDATE profiles SET free_images_remaining=20 WHERE id=$1", [USER]);
    const handle = handler();
    let successes = 0;

    for (const format of ["jpeg", "png", "webp"]) {
      const seed = await handle(request("convert-image", JSON.stringify({ image_data: PNG, format })));

      expect(seed.status).toBe(200);
      const input = Schema.decodeUnknownSync(ImageTransformResponse)(await seed.json()).result_image;

      successes++;

      for (const target of ["jpeg", "png", "webp"]) {
        const converted = await handle(request("convert-image", JSON.stringify({ image_data: input, format: target })));

        expect(converted.status).toBe(200);
        expect(Schema.decodeUnknownSync(ImageTransformResponse)(await converted.json()).metadata.format).toBe(target);
        successes++;
      }

      const compressed = await handle(request("compress-image", JSON.stringify({ image_data: input })));

      expect(compressed.status).toBe(200);
      expect(Schema.decodeUnknownSync(ImageTransformResponse)(await compressed.json()).metadata.bytes_saved).toBeGreaterThanOrEqual(0);
      successes++;
    }

    const truncated = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(24)]).toString("base64");

    expect((await handle(request("compress-image", JSON.stringify({ image_data: truncated })))).status).toBe(400);
    expect(await database.stats(USER)).toMatchObject({ images_processed: successes, free_credits_remaining: 20 - successes, api_calls_total: successes + 1 });
    expect(gpu).not.toHaveBeenCalled();
  }, 30_000);

  it("charges once per successful operation and never calls the GPU", async () => {
    const handle = handler();
    const compressed = await handle(request());

    expect(compressed.status).toBe(200);
    expect(Schema.decodeUnknownSync(ImageTransformResponse)(await compressed.json())).toMatchObject({ result_image: PNG, metadata: metadata() });
    cpu.mockResolvedValueOnce(output("convert-image"));
    const converted = await handle(request("convert-image", JSON.stringify({ image_data: PNG, format: "png", compression_level: 6 }), "session", true));

    expect(converted.status).toBe(200);
    expect(converted.headers.get("content-type")).toBe("image/png");
    expect(converted.headers.get("Access-Control-Allow-Origin")).toBe("https://web.example");
    expect(Buffer.from(await converted.arrayBuffer())).toEqual(bytes);
    expect((await handle(request())).status).toBe(402);
    expect(cpu).toHaveBeenCalledTimes(2);
    expect(gpu).not.toHaveBeenCalled();
    expect(await database.stats(USER)).toMatchObject({ images_processed: 2, free_credits_remaining: 0, bulk_credits_remaining: 0 });
  });

  it("serializes the shared CPU job and accepts raw compression uploads", async () => {
    let job: ImageTransformJob | undefined;

    cpu.mockImplementationOnce(async (_url, init) => {
      job = Schema.decodeUnknownSync(ImageTransformJob)(JSON.parse(await new Response(init?.body).text()));

      return output();
    });

    const response = await handler()(new Request("https://api.example/api/v1/compress-image", {
      method: "POST", body: bytes, headers: { Authorization: "Bearer session", "Content-Type": "image/png", Accept: "image/*" },
    }));

    expect(response.status).toBe(200);
    expect(job).toEqual({ image_data: PNG, operation: "compress-image", format: "png" });
  });

  it("leaves encoding defaults to the worker and preserves every explicit override", async () => {
    const compressed = await readImageTransformRequest(request(), "compress-image");

    expect(compressed).toEqual({ image_data: PNG, operation: "compress-image", format: "png" });

    for (const format of ["jpeg", "png", "webp"]) {
      const input = { image_data: PNG, format };

      expect(await readImageTransformRequest(request("convert-image", JSON.stringify(input)), "convert-image"))
        .toEqual({ ...input, operation: "convert-image" });
    }

    for (const options of [{ format: "png", compression_level: 0 }, { format: "webp", quality: 1, lossless: false }, { format: "webp", quality: 100, lossless: true }, { format: "jpeg", quality: 72 }]) {
      const input = { image_data: PNG, ...options };

      expect(await readImageTransformRequest(request("convert-image", JSON.stringify(input)), "convert-image"))
        .toEqual({ ...input, operation: "convert-image" });
    }
  });

  it("rejects malformed and inapplicable options before reserving credits", async () => {
    const handle = handler();

    for (const payload of [
      { image_data: PNG, format: "png" }, { image_data: "invalid" },
      { image_data: PNG, quality: 80 }, { image_data: PNG, lossless: false },
      { image_data: PNG, compression_level: 10 }, { image_data: PNG, compression_level: 1.5 },
      { image_data: PNG, return_mask: true }, { image_data: PNG, resize_options: { width: 5, height: 5 } },
    ]) expect((await handle(request("compress-image", JSON.stringify(payload)))).status).toBe(400);

    for (const payload of [
      { image_data: PNG }, { image_data: PNG, format: "gif" },
      { image_data: PNG, format: "jpeg", quality: 0 }, { image_data: PNG, format: "webp", quality: 101 },
      { image_data: PNG, format: "jpeg", lossless: true }, { image_data: PNG, format: "webp", compression_level: 3 },
    ]) expect((await handle(request("convert-image", JSON.stringify(payload)))).status).toBe(400);

    expect((await handle(request("compress-image", "{"))).status).toBe(400);
    expect(cpu).not.toHaveBeenCalled();
    expect(await database.stats(USER)).toMatchObject({ free_credits_remaining: 1, api_calls_total: 0 });
  });

  it("bounds real decoded upload bytes and raw input streams before processing", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);

    bytes.copy(big);
    const handle = handler();

    expect((await handle(request("compress-image", JSON.stringify({ image_data: big.toString("base64") })))).status).toBe(400);
    expect((await handle(new Request("https://api.example/api/v1/compress-image", { method: "POST", body: big, headers: { Authorization: "Bearer session", "Content-Type": "image/png" } }))).status).toBe(413);
    expect(cpu).not.toHaveBeenCalled();
    expect(await database.stats(USER)).toMatchObject({ free_credits_remaining: 1, api_calls_total: 0 });
  });

  it("refunds decoder errors, provider failures, malformed results, and interrupted downloads without retries", async () => {
    const handle = handler();

    const responses = [new Response(null, { status: 400 }), new Response(null, { status: 503 }), Response.json({ success: true }),
      new Response(bytes, { headers: { "Content-Type": "image/png", "X-Image-Metadata": JSON.stringify({ ...metadata(), output_bytes: 1 }) } }),
      new Response(bytes, { headers: { "Content-Type": "image/jpeg", "X-Image-Metadata": JSON.stringify(metadata()) } }),
      new Response(new ReadableStream({ start(controller) { controller.error(new Error("Interrupted")); } }), { headers: { "Content-Type": "image/png", "X-Image-Metadata": JSON.stringify(metadata()) } }),
    ];

    for (const response of responses) {
      cpu.mockResolvedValueOnce(response);
      expect([400, 502]).toContain((await handle(request())).status);
    }

    cpu.mockRejectedValueOnce(new Error("Network failure"));
    expect((await handle(request())).status).toBe(502);
    expect(cpu).toHaveBeenCalledTimes(responses.length + 1);
    expect(await database.stats(USER)).toMatchObject({ images_processed: 0, free_credits_remaining: 1, bulk_credits_remaining: 1 });
    expect((await database.activity(USER, 20, 0)).every((row) => !row.was_successful)).toBe(true);
  });

  it("supports owned API keys and rejects revoked keys and trial access", async () => {
    const key = "bg_user_test";
    const id = await database.createKey(USER, "Image client", await hashKey(key), "bg_user");
    const handle = handler();

    expect((await handle(request("compress-image", undefined, key))).status).toBe(200);
    await database.deleteKey(USER, id);
    expect((await handle(request("compress-image", undefined, key))).status).toBe(401);
    await sql.query("INSERT INTO api_keys (key_name, hashed_key, key_prefix, is_service, scopes) VALUES ('trial', $1, 'bg_trial', true, ARRAY['trial'])", [await hashKey("bg_trial")]);

    for (const operation of ["compress-image", "convert-image"]) {
      const input = request(operation, undefined, "bg_trial");

      input.headers.set("X-Usage-Context", "trial");
      expect((await handle(input)).status).toBe(403);
      expect((await handle(new Request(`https://api.example/api/v1/${operation}`, { method: "POST" }))).status).toBe(401);
    }

    expect(cpu).toHaveBeenCalledTimes(1);
  });

  it("does not charge when the CPU endpoint has not been configured", async () => {
    expect((await handler(false)(request())).status).toBe(503);
    expect(cpu).not.toHaveBeenCalled();
    expect(await database.stats(USER)).toMatchObject({ free_credits_remaining: 1, api_calls_total: 0 });
  });
});
