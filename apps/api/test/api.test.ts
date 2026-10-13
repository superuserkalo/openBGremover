import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Schema } from "effect";
import { ActivityResponse, CreateKeyResponse, KeysResponse, RemoveBackgroundResponse, StatsResponse } from "@openbg/contracts";
import { createDatabase } from "../src/database";
import { ApiError } from "../src/errors";
import { createHandler } from "../src/http";
import { createProcessor } from "../src/media";
import { hashKey } from "../src/auth";
import { readText } from "../src/body";

const USER = "00000000-0000-4000-8000-000000000001";

const OTHER = "00000000-0000-4000-8000-000000000002";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wwAAwMBAe9qg6kAAAAASUVORK5CYII=";

const sql = new PGlite();

const database = createDatabase({
  async query<Row extends object>(text: string, values?: readonly (string | number | boolean | null)[]) {
    const result = await sql.query<Row>(text, values ? [...values] : []);

    return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
  },
});

const gpu = vi.fn(async () => Response.json({ success: true, image: PNG, metadata: { format: "png" } }));

const deleteUser = vi.fn(async () => undefined);

const handler = createHandler({
  auth: { verify: async (token) => {
    if (token !== "session") throw new ApiError({ code: "INVALID_TOKEN", message: "Invalid session", status: 401 });

    return USER;
  }, deleteUser },
  withDatabase: (use) => use(database),
  process: createProcessor({ endpoint: "https://gpu.example/run", apiKey: "test" }, gpu),
  allowedOrigins: ["https://web.example"],
  allowTrial: async () => true,
});

function request(path: string, method = "GET", token = "session", body?: string): Request {
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${token}`, Origin: "https://web.example", "Content-Type": "application/json" } };

  if (body !== undefined) init.body = body;

  return new Request(`https://api.example${path}`, init);
}

beforeAll(async () => {
  await sql.exec(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
}, 30_000);

afterAll(() => sql.close());

beforeEach(async () => {
  await sql.exec("TRUNCATE usage_logs, api_keys, profiles RESTART IDENTITY CASCADE");
  await sql.query("INSERT INTO profiles (id, free_images_remaining, bulk_images_remaining) VALUES ($1, 1, 1), ($2, 2, 0)", [USER, OTHER]);
  gpu.mockReset();
  gpu.mockImplementation(async () => Response.json({ success: true, image: PNG, metadata: { format: "png" } }));
  deleteUser.mockClear();
});

describe("API and PostgreSQL accounting", () => {
  it("charges free then bulk credits and rejects exhausted balances before calling the GPU", async () => {
    for (const expectedStatus of [200, 200, 402]) {
      const response = await handler(request("/api/v1/remove-background", "POST", "session", JSON.stringify({ image_data: PNG })));

      expect(response.status).toBe(expectedStatus);

      if (response.ok) expect(Schema.decodeUnknownSync(RemoveBackgroundResponse)(await response.json()).result_image).toBe(PNG);
    }

    expect(gpu).toHaveBeenCalledTimes(2);
    expect(await database.stats(USER)).toMatchObject({ images_processed: 2, free_credits_remaining: 0, bulk_credits_remaining: 0 });
    expect((await database.activity(USER, 10, 0)).map((item) => item.credit_type)).toEqual(["bulk", "free"]);
  });

  it("refunds failed and malformed GPU responses and records failed activity", async () => {
    gpu.mockResolvedValueOnce(new Response("failure", { status: 503 }));
    gpu.mockResolvedValueOnce(Response.json({ success: true, image: 42 }));

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await handler(request("/api/v1/remove-background", "POST", "session", JSON.stringify({ image_data: PNG })));

      expect(response.status).toBe(502);
      expect(await database.stats(USER)).toMatchObject({ images_processed: 0, free_credits_remaining: 1, bulk_credits_remaining: 1 });
    }

    expect((await database.activity(USER, 10, 0)).every((item) => !item.was_successful)).toBe(true);
  });

  it("rejects invalid image data and resize values without spending credits", async () => {
    for (const payload of [{ image_data: "garbage" }, { image_data: PNG, format: "exe" }, { image_data: PNG, resize_options: { width: -1, height: 5 } }]) {
      expect((await handler(request("/api/v1/remove-background", "POST", "session", JSON.stringify(payload)))).status).toBe(400);
    }

    expect(gpu).not.toHaveBeenCalled();
    expect(await database.stats(USER)).toMatchObject({ free_credits_remaining: 1, api_calls_total: 0 });
  });

  it("creates hashed keys, allows usage reads, and enforces ownership on deletion", async () => {
    const created = await handler(request("/api/v1/keys", "POST", "session", JSON.stringify({ name: "Agent" })));
    const key = Schema.decodeUnknownSync(CreateKeyResponse)(await created.json());

    expect(created.status).toBe(201);
    expect(await database.findKey(await hashKey(key.api_key))).toMatchObject({ user_id: USER });
    expect((await handler(request("/api/v1/account", "DELETE", key.api_key))).status).toBe(403);
    expect((await handler(request("/api/v1/stats", "GET", key.api_key))).status).toBe(200);
    expect((await handler(request("/api/v1/keys", "GET", key.api_key))).status).toBe(403);
    expect((await handler(request("/api/v1/remove-background", "POST", key.api_key, JSON.stringify({ image_data: PNG })))).status).toBe(200);
    const otherKey = await database.createKey(OTHER, "Other", "other-hash", "other");

    expect((await handler(request(`/api/v1/keys/${otherKey}`, "DELETE"))).status).toBe(404);
    expect((await database.listKeys(OTHER))).toHaveLength(1);
    expect((await handler(request(`/api/v1/keys/${key.key_id}`, "DELETE"))).status).toBe(200);
    expect(await database.findKey(await hashKey(key.api_key))).toBeNull();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("returns contract-valid stats, keys, and activity with CORS only for allowed origins", async () => {
    const stats = await handler(request("/api/v1/stats"));

    expect(Schema.decodeUnknownSync(StatsResponse)(await stats.json()).free_credits_remaining).toBe(1);
    expect(stats.headers.get("Access-Control-Allow-Origin")).toBe("https://web.example");
    expect(Schema.decodeUnknownSync(KeysResponse)(await (await handler(request("/api/v1/keys"))).json()).keys).toEqual([]);
    expect(Schema.decodeUnknownSync(ActivityResponse)(await (await handler(request("/api/v1/activity"))).json()).activities).toEqual([]);
    expect((await handler(new Request("https://api.example/health", { headers: { Origin: "https://untrusted.example" } }))).headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("does not grant unpaid credits or expose the legacy unauthenticated processing route", async () => {
    expect((await handler(request("/api/v1/billing/upgrade", "POST", "session", JSON.stringify({ plan: "bulk", package: "enterprise" })))).status).toBe(501);
    expect((await handler(new Request("https://api.example/v1/remove-background", { method: "POST" }))).status).toBe(404);
    expect((await handler(new Request("https://api.example/api/v1/remove-background", { method: "POST" }))).status).toBe(401);
    expect(await database.stats(USER)).toMatchObject({ free_credits_remaining: 1, bulk_credits_remaining: 1 });
    expect(gpu).not.toHaveBeenCalled();
  });

  it("limits service keys to the explicit trial processing context", async () => {
    const token = "bg_trial_test";

    await sql.query("INSERT INTO api_keys (key_name, hashed_key, key_prefix, is_service, scopes) VALUES ('trial', $1, 'bg_trial', true, ARRAY['trial'])", [await hashKey(token)]);
    const demo = request("/api/v1/remove-background", "POST", token, JSON.stringify({ image_data: PNG }));

    demo.headers.set("X-Usage-Context", "trial");
    const result = await handler(demo);

    expect(result.status).toBe(200);
    expect(result.headers.get("Content-Type")).toBe("image/png");
    expect(Buffer.from(await result.arrayBuffer()).toString("base64")).toBe(PNG);
    expect((await handler(request("/api/v1/remove-background", "POST", token, JSON.stringify({ image_data: PNG })))).status).toBe(403);
    const keys = request("/api/v1/keys", "GET", token);

    keys.headers.set("X-Usage-Context", "trial");
    expect((await handler(keys)).status).toBe(403);
    expect(await database.stats(USER)).toMatchObject({ free_credits_remaining: 1 });
  });

  it("rolls back a refund when its usage insert fails", async () => {
    await database.reserveCredit(USER);
    await expect(database.recordUsage({ userId: USER, keyId: 999, source: "api", credit: "free", success: false, error: "test", milliseconds: 1 })).rejects.toThrow();
    expect(await database.stats(USER)).toMatchObject({ free_credits_remaining: 0, api_calls_total: 0 });
  });

  it("bounds streamed bodies even when content-length is absent", async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(8)); controller.enqueue(new Uint8Array(8)); controller.close(); } });

    await expect(readText(new Response(stream), 10)).rejects.toMatchObject({ status: 413 });
  });
});
