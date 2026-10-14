import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { Schema } from "effect";
import { CreateKeyResponse, RemoveBackgroundResponse } from "@openbg/contracts";

function required(name: string): string {
  const value = process.env[name];

  if (!value) throw new Error(`Set ${name} before running the benchmark`);

  return value;
}

const api = required("E2E_API_URL");

const supabase = required("NEXT_PUBLIC_SUPABASE_URL");

const publicKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const adminKey = required("SUPABASE_SERVICE_ROLE_KEY");

const stubId = required("BENCHMARK_STUB_ID");

const beamCli = process.env.BENCHMARK_BEAM_CLI ?? ".venv/bin/beam";

const output = process.env.BENCHMARK_OUTPUT ?? "artifacts/benchmarks/baseline";

const image = await readFile(required("E2E_IMAGE_PATH"));

const imageData = image.toString("base64");

const cycles = Schema.decodeUnknownSync(Schema.NumberFromString.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 10 })))(process.env.BENCHMARK_CYCLES ?? "2");

const warmRequests = Schema.decodeUnknownSync(Schema.NumberFromString.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 10 })))(process.env.BENCHMARK_WARM_REQUESTS ?? "5");

const exec = promisify(execFile);

const Containers = Schema.Array(Schema.Struct({
  container_id: Schema.String,
  stub_id: Schema.String,
  status: Schema.String,
  scheduled_at: Schema.optionalKey(Schema.String),
  started_at: Schema.optionalKey(Schema.String),
}));

interface Measurement {
  cycle: number;
  temperature: "cold" | "warm";
  started_at: string;
  status: number;
  headers_ms: number;
  total_ms: number;
  api_worker_roundtrip_ms: number;
  worker_processing_ms: number;
  output_bytes: number;
  output_sha256: string;
  api_duration_ms: number | null;
  api_received_at: string | null;
  request_id: string | null;
}

const measurements: Measurement[] = [];

const observations: { at: string; containers: typeof Containers.Type }[] = [];

const startedAt = new Date().toISOString();

let completed = false;

let cleanedUp = false;

let userId: string | undefined;

let session: string | undefined;

let failure: string | undefined;

async function save(): Promise<void> {
  await writeFile(`${output}/report.json`, JSON.stringify({
    started_at: startedAt, updated_at: new Date().toISOString(), completed, cleaned_up: cleanedUp,
    api, stub_id: stubId, image_bytes: image.length, temporary_user_id: userId, failure,
    methodology: `${cycles} natural scale-to-zero cold starts, each followed by ${warmRequests} sequential warm requests. Same PNG and deployment. No forced container stops.`,
    measurements, container_observations: observations,
  }, null, 2));
}

async function containers() {
  const { stdout } = await exec(beamCli, ["container", "list", "--format", "json"], { timeout: 30_000 });
  const active = Schema.decodeUnknownSync(Containers)(JSON.parse(stdout)).filter((item) => item.stub_id === stubId);

  observations.push({ at: new Date().toISOString(), containers: active });
  await save();

  return active;
}

async function waitForZero(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const active = await containers();

    if (active.length === 0) {
      console.log("Confirmed zero deployment containers before cold request");

      return;
    }

    if (attempt % 3 === 0) console.log(`Waiting for natural scale-to-zero: ${active.length} container(s)`);

    await delay(20_000);
  }

  throw new Error("Deployment remained active; refusing to label a warm request as cold");
}

async function measure(key: string, cycle: number, temperature: Measurement["temperature"]): Promise<void> {
  const started = performance.now();
  const at = new Date().toISOString();

  const response = await fetch(`${api}/api/v1/remove-background`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image_data: imageData, format: "png" }), signal: AbortSignal.timeout(200_000),
  });

  const headersMs = performance.now() - started;
  const bytes = await response.arrayBuffer();
  const totalMs = performance.now() - started;

  assert.equal(response.status, 200, "Image request must succeed");

  const result = Schema.decodeUnknownSync(RemoveBackgroundResponse)(JSON.parse(new TextDecoder().decode(bytes)));

  assert.equal(result.metadata.device, "cuda");
  assert.equal(result.metadata.model, "ZhengPeng7/BiRefNet_HR-matting");
  assert.ok(result.metadata.processing_time_ms !== undefined);

  const png = Buffer.from(result.result_image, "base64");

  assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  measurements.push({
    cycle, temperature, started_at: at, status: response.status,
    headers_ms: Math.round(headersMs), total_ms: Math.round(totalMs),
    api_worker_roundtrip_ms: result.processing_time_ms,
    worker_processing_ms: result.metadata.processing_time_ms, output_bytes: png.length,
    output_sha256: createHash("sha256").update(png).digest("hex"),
    api_duration_ms: response.headers.has("X-Benchmark-Duration-Ms") ? Number(response.headers.get("X-Benchmark-Duration-Ms")) : null,
    api_received_at: response.headers.get("X-Benchmark-Received-At"),
    request_id: response.headers.get("X-Benchmark-Request-Id"),
  });
  await writeFile(`${output}/output.png`, png);
  await save();
  console.log(JSON.stringify(measurements.at(-1)));
}

await mkdir(output, { recursive: true });

try {
  const email = `benchmark-${randomUUID()}@openbgremover.dev`;
  const password = `Aa1!${randomUUID()}${randomUUID().slice(0, 20)}`;

  const created = await fetch(`${supabase}/auth/v1/admin/users`, {
    method: "POST", headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { purpose: "latency-benchmark" } }),
  });

  assert.equal(created.status, 200, "Create temporary benchmark identity");
  userId = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(await created.json()).id;
  await save();

  const login = await fetch(`${supabase}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: publicKey, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
  });

  assert.equal(login.status, 200);
  session = Schema.decodeUnknownSync(Schema.Struct({ access_token: Schema.String }))(await login.json()).access_token;

  const createdKey = await fetch(`${api}/api/v1/keys`, {
    method: "POST", headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Temporary latency benchmark" }),
    signal: AbortSignal.timeout(30_000),
  });

  assert.equal(createdKey.status, 201, `Create API key: ${createdKey.status}`);

  const key = Schema.decodeUnknownSync(CreateKeyResponse)(await createdKey.json()).api_key;

  for (let cycle = 1; cycle <= cycles; cycle++) {
    await waitForZero();
    await measure(key, cycle, "cold");
    await containers();

    for (let index = 0; index < warmRequests; index++) await measure(key, cycle, "warm");

    await containers();
  }

  completed = true;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  console.error("Benchmark failed:", failure);
  throw error;
} finally {
  try {
    if (userId) {
      const removed = session ? await fetch(`${api}/api/v1/account`, {
        method: "DELETE", headers: { Authorization: `Bearer ${session}` }, signal: AbortSignal.timeout(15_000),
      }).catch(() => undefined) : undefined;

      if (!removed?.ok) {
        // Use the admin REST API so cleanup also works when the tested API or DB pooler is unavailable.
        const tables = [{ name: "usage_logs", column: "user_id" }, { name: "api_keys", column: "user_id" }, { name: "profiles", column: "id" }];

        for (const table of tables) {
          const deleted: Response = await fetch(`${supabase}/rest/v1/${table.name}?${table.column}=eq.${userId}`, {
            method: "DELETE", headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` }, signal: AbortSignal.timeout(15_000),
          });

          assert.ok(deleted.ok, `Remove temporary ${table.name} rows`);
        }

        const deleted = await fetch(`${supabase}/auth/v1/admin/users/${userId}`, {
          method: "DELETE", headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
        });

        assert.ok(deleted.ok, "Remove temporary benchmark identity after an earlier failure");
      }

      const absent = await fetch(`${supabase}/auth/v1/admin/users/${userId}`, { headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` } });

      assert.equal(absent.status, 404);
      cleanedUp = true;
    }
  } finally {
    await save();
  }
}
