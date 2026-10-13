import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { Schema } from "effect";
import { ActivityResponse, CreateKeyResponse, KeysResponse, RemoveBackgroundResponse, StatsResponse } from "@openbg/contracts";

function required(name: string): string {
  const value = process.env[name];

  if (!value) throw new Error(`Set ${name} before running the live test`);

  return value;
}

const api = required("E2E_API_URL");

const supabase = required("NEXT_PUBLIC_SUPABASE_URL");

const publicKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const adminKey = required("SUPABASE_SERVICE_ROLE_KEY");

const databaseUrl = required("DATABASE_URL");

const imagePath = required("E2E_IMAGE_PATH");

const outputDirectory = "artifacts/e2e";

const checks: string[] = [];

const started = Date.now();

const email = `e2e-${randomUUID()}@openbgremover.dev`;

const password = `Aa1!${randomUUID()}${randomUUID().slice(0, 20)}`;

let userId: string | undefined;

let session: string | undefined;

let completed = false;

const adminHeaders = { apikey: adminKey, Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" };

async function call(path: string, token: string, method = "GET", body?: string): Promise<Response> {
  const options: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Origin: "https://openbgremover.dev" },
    signal: AbortSignal.timeout(200_000),
  };

  if (body !== undefined) options.body = body;

  return fetch(`${api}${path}`, options);
}

async function stats(token: string) {
  const response = await call("/api/v1/stats", token);

  assert.equal(response.status, 200, "Usage statistics must be available");

  return Schema.decodeUnknownSync(StatsResponse)(await response.json());
}

function passed(check: string): void {
  checks.push(check);
  console.log(`PASS ${check}`);
}

await mkdir(outputDirectory, { recursive: true });

try {
  assert.equal((await fetch(`${api}/health`)).status, 200);
  assert.equal((await fetch(`${api}/api/v1/stats`)).status, 401);
  passed("Deployed API health and unauthenticated rejection");

  // Confirm this temporary test identity directly; no verification email is sent.
  const created = await fetch(`${supabase}/auth/v1/admin/users`, {
    method: "POST", headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { purpose: "deployment-e2e" } }),
  });

  if (created.status !== 200) {
    const error = Schema.decodeUnknownSync(Schema.Struct({
      msg: Schema.optionalKey(Schema.String), message: Schema.optionalKey(Schema.String),
    }))(await created.json());

    throw new Error(`Create temporary Supabase account (${created.status}): ${error.msg ?? error.message ?? "Request rejected"}`);
  }

  userId = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(await created.json()).id;

  const login = await fetch(`${supabase}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: publicKey, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
  });

  assert.equal(login.status, 200, "Sign in through Supabase");
  session = Schema.decodeUnknownSync(Schema.Struct({ access_token: Schema.String }))(await login.json()).access_token;

  const initial = await stats(session);

  assert.ok(initial.free_credits_remaining >= 1, "Signup trigger supplies test credits");
  passed("Supabase login, JWT verification, signup profile, and numeric credit balances");

  const createdKey = await call("/api/v1/keys", session, "POST", JSON.stringify({ name: "Deployment verification" }));

  assert.equal(createdKey.status, 201);

  const key = Schema.decodeUnknownSync(CreateKeyResponse)(await createdKey.json());
  const listed = Schema.decodeUnknownSync(KeysResponse)(await (await call("/api/v1/keys", session)).json());

  assert.ok(listed.keys.some((item) => item.id === key.key_id));
  assert.equal((await call("/api/v1/keys", key.api_key)).status, 403);
  passed("API key creation, listing, and account-management scope");

  const image = (await readFile(imagePath)).toString("base64");
  const processed = await call("/api/v1/remove-background", key.api_key, "POST", JSON.stringify({ image_data: image, format: "png", return_mask: true }));

  assert.equal(processed.status, 200, "Real GPU processing through Cloudflare");
  assert.equal(processed.headers.get("Access-Control-Allow-Origin"), "https://openbgremover.dev");

  const result = Schema.decodeUnknownSync(RemoveBackgroundResponse)(await processed.json());

  assert.equal(result.metadata.model, "ZhengPeng7/BiRefNet_HR-matting");
  assert.equal(result.metadata.device, "cuda");
  assert.ok(result.mask_image);
  await writeFile(`${outputDirectory}/api-output.png`, Buffer.from(result.result_image, "base64"));
  await writeFile(`${outputDirectory}/api-mask.png`, Buffer.from(result.mask_image, "base64"));

  const afterSuccess = await stats(key.api_key);

  assert.equal(afterSuccess.free_credits_remaining, initial.free_credits_remaining - 1);
  assert.equal(afterSuccess.images_processed, 1);
  passed("Cloudflare to Hyperdrive to Beam GPU processing, PNG/mask output, and one-credit charge");

  const malformed = await call("/api/v1/remove-background", key.api_key, "POST", JSON.stringify({ image_data: "invalid" }));

  assert.equal(malformed.status, 400);
  // The valid PNG signature reaches the GPU decoder, which rejects the truncated file.
  const truncated = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(24)]).toString("base64");
  const failed = await call("/api/v1/remove-background", key.api_key, "POST", JSON.stringify({ image_data: truncated }));

  assert.equal(failed.status, 502);
  assert.equal((await stats(key.api_key)).free_credits_remaining, afterSuccess.free_credits_remaining);

  const activity = Schema.decodeUnknownSync(ActivityResponse)(await (await call("/api/v1/activity", key.api_key)).json());

  assert.equal(activity.activities.filter((item) => item.was_successful).length, 1);
  assert.equal(activity.activities.filter((item) => !item.was_successful).length, 1);
  passed("Invalid input rejection, real worker failure refund, and persisted usage activity");

  assert.equal((await call(`/api/v1/keys/${key.key_id}`, session, "DELETE")).status, 200);
  assert.equal((await call("/api/v1/stats", key.api_key)).status, 401);
  passed("Immediate API key revocation");
  completed = true;
} finally {
  if (userId) {
    const deleted = session ? await call("/api/v1/account", session, "DELETE") : undefined;

    if (!deleted?.ok) {
      // Clean only the account created by this process if an earlier API step failed.
      const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000 });

      try {
        await client.connect();
        await client.query("BEGIN");
        await client.query("DELETE FROM usage_logs WHERE user_id=$1", [userId]);
        await client.query("DELETE FROM api_keys WHERE user_id=$1", [userId]);
        await client.query("DELETE FROM profiles WHERE id=$1", [userId]);
        await client.query("COMMIT");
      } finally {
        await client.end();
      }

      const removed = await fetch(`${supabase}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders });

      assert.ok(removed.ok, "Remove temporary authentication account");
    }

    const absent = await fetch(`${supabase}/auth/v1/admin/users/${userId}`, { headers: adminHeaders });

    assert.equal(absent.status, 404, "Temporary account must be removed");
    passed("Temporary account and test data removed");
  }

  await writeFile(`${outputDirectory}/api-report.json`, JSON.stringify({ completed, checked_at: new Date().toISOString(), api, elapsed_ms: Date.now() - started, checks }, null, 2));
}
