import { Effect, Schema } from "effect";
import { CreateKeyRequest, type RemoveBackgroundResponse } from "@openbg/contracts";
import { bearerToken, generateKey, hashKey, type createAuth } from "./auth";
import { readText } from "./body";
import type { Database } from "./database";
import { ApiError, attempt, errorResponse } from "./errors";
import { decodeImageRequest, removeBackground, type Identity, type Processor } from "./media";

export interface Dependencies {
  auth: ReturnType<typeof createAuth>;
  withDatabase: (use: (database: Database) => Promise<Response>) => Promise<Response>;
  process: Processor;
  allowedOrigins: readonly string[];
  allowTrial: () => Promise<boolean>;
}

function invalidRequest(message: string): ApiError {
  return new ApiError({ code: "INVALID_REQUEST", message, status: 400 });
}

function pagination(value: string | null, fallback: number, maximum: number): number {
  if (value === null) return fallback;

  const number = Number(value);

  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number > maximum) {
    throw invalidRequest("Invalid pagination");
  }

  return number;
}

async function identify(request: Request, db: Database, sessionUserId: string | null): Promise<Identity> {
  const token = bearerToken(request);

  if (sessionUserId !== null) {
    return { kind: "user", userId: sessionUserId, keyId: null, source: "ui" };
  }

  const key = await db.findKey(await hashKey(token));

  if (!key) throw new ApiError({ code: "INVALID_API_KEY", message: "API key is invalid or revoked", status: 401 });

  if (key.is_service) {
    if (!key.scopes.includes("trial") || request.headers.get("x-usage-context") !== "trial") {
      throw new ApiError({ code: "FORBIDDEN", message: "Service key is not permitted here", status: 403 });
    }

    return { kind: "trial" };
  }

  if (!key.user_id) throw new ApiError({ code: "INVALID_API_KEY", message: "API key has no owner", status: 401 });

  return { kind: "user", userId: key.user_id, keyId: key.id, source: "api" };
}

function imageResponse(result: RemoveBackgroundResponse, format: string): Response {
  const binary = atob(result.result_image);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const actualFormat = result.metadata.format ?? format;
  const extension = actualFormat === "jpg" ? "jpeg" : actualFormat;

  return new Response(bytes, { headers: { "Content-Type": `image/${extension}` } });
}

export function createHandler(deps: Dependencies) {
  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") return new Response(null, { status: 204 });

    if (request.method === "GET" && (path === "/health" || path === "/" || path === "/api/info")) {
      return Response.json({ status: "ok", service: "openbg-api", operations: ["remove-background"] });
    }

    const routeKey = `${request.method} ${path}`;
    const keyDeletion = request.method === "DELETE" && /^\/api\/v1\/keys\/\d+$/.test(path);
    const routes = ["POST /api/v1/remove-background", "GET /api/v1/stats", "GET /api/v1/activity", "GET /api/v1/keys", "POST /api/v1/keys", "DELETE /api/v1/account", "POST /api/v1/billing/upgrade"];

    if (!keyDeletion && !routes.includes(routeKey)) {
      throw new ApiError({ code: "NOT_FOUND", message: "Route not found", status: 404 });
    }

    // Reject missing credentials before reading an image or opening a database connection.
    const token = bearerToken(request);
    const sessionUserId = token.startsWith("bg_") ? null : await deps.auth.verify(token);

    return deps.withDatabase(async (db) => {
      const identity = await identify(request, db, sessionUserId);

      if (routeKey === "POST /api/v1/remove-background") {
        const input = decodeImageRequest(await readText(request));

        if (identity.kind === "trial" && !(await deps.allowTrial())) {
          throw new ApiError({ code: "RATE_LIMITED", message: "The demo is busy. Please try again in a minute", status: 429 });
        }

        return Effect.runPromise(removeBackground(input, identity, db, deps.process).pipe(Effect.match({
          onFailure: errorResponse,
          onSuccess: (result) => identity.kind === "trial" ? imageResponse(result, input.format ?? "png") : Response.json(result),
        })));
      }

      const isUsageRead = routeKey === "GET /api/v1/stats" || routeKey === "GET /api/v1/activity";

      if (identity.kind === "trial" || (identity.keyId !== null && !isUsageRead)) {
        throw new ApiError({ code: "SESSION_REQUIRED", message: "Sign in to manage your account", status: 403 });
      }

      const userId = identity.userId;

      switch (routeKey) {
        case "GET /api/v1/stats": return Response.json(await db.stats(userId));
        case "GET /api/v1/activity": {
          const limit = Math.max(1, pagination(url.searchParams.get("limit"), 50, 100));
          const offset = pagination(url.searchParams.get("offset"), 0, 100_000);

          return Response.json({ success: true, activities: await db.activity(userId, limit, offset) });
        }

        case "GET /api/v1/keys": return Response.json({ success: true, keys: await db.listKeys(userId) });
        case "POST /api/v1/keys": {
          let name: string;

          try {
            name = Schema.decodeUnknownSync(CreateKeyRequest)(JSON.parse(await readText(request, 4096))).name.trim();
          } catch {
            throw invalidRequest("Provide an API key name");
          }

          if (!name || name.length > 100) throw invalidRequest("API key names must contain 1–100 characters");

          const key = generateKey();
          const id = await db.createKey(userId, name, await hashKey(key), key.slice(0, 16));

          return Response.json({ success: true, api_key: key, key_id: id }, { status: 201 });
        }

        case "DELETE /api/v1/account": {
          await db.deleteUserData(userId);
          await deps.auth.deleteUser(userId);

          return Response.json({ success: true });
        }

        case "POST /api/v1/billing/upgrade": {
          throw new ApiError({ code: "BILLING_UNAVAILABLE", message: "Payments are not available yet. No changes were made to your credits", status: 501 });
        }

        default: {
          const id = Number(path.split("/").at(-1));

          if (!Number.isSafeInteger(id) || id < 1) throw invalidRequest("Invalid API key ID");

          await db.deleteKey(userId, id);

          return Response.json({ success: true });
        }
      }
    });
  }

  return async (request: Request): Promise<Response> => {
    const response = await Effect.runPromise(attempt(() => route(request)).pipe(Effect.match({
      onSuccess: (result) => result,
      onFailure: errorResponse,
    })));

    const origin = request.headers.get("origin");

    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Vary", "Origin");

    if (origin && deps.allowedOrigins.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Usage-Context");
    }

    return response;
  };
}
