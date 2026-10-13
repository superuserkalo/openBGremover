import { createRemoteJWKSet, customFetch, decodeProtectedHeader, jwtVerify } from "jose";
import { Schema } from "effect";
import { ApiError } from "./errors";

export interface AuthConfig {
  url: string;
  publishableKey: string;
  secretKey: string;
}

const SupabaseUser = Schema.Struct({ id: Schema.String, aud: Schema.String });

export function createAuth(config: AuthConfig, fetcher: typeof fetch = fetch) {
  const issuer = `${config.url.replace(/\/$/, "")}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { [customFetch]: fetcher });

  return {
    async verify(token: string): Promise<string> {
      try {
        const header = decodeProtectedHeader(token);

        if (header.alg === "HS256") {
          // Let Supabase validate legacy sessions. Never copy the old JWT secret into this service.
          const response = await fetcher(`${issuer}/user`, {
            headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) throw new Error("Invalid session");

          const user = Schema.decodeUnknownSync(SupabaseUser)(await response.json());

          if (user.aud !== "authenticated" || !user.id) throw new Error("Invalid session");

          return user.id;
        }

        const { payload } = await jwtVerify(token, jwks, {
          issuer, audience: "authenticated", algorithms: ["ES256", "RS256"],
          requiredClaims: ["sub", "exp", "iat"],
        });

        if (!payload.sub || payload.role !== "authenticated") throw new Error("Invalid session");

        return payload.sub;
      } catch {
        throw new ApiError({ code: "INVALID_TOKEN", message: "Sign in again to continue", status: 401 });
      }
    },
    async deleteUser(userId: string): Promise<void> {
      const response = await fetcher(`${issuer}/admin/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: { apikey: config.secretKey, Authorization: `Bearer ${config.secretKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok && response.status !== 404) {
        throw new ApiError({ code: "AUTH_DELETE_FAILED", message: "Could not delete the account", status: 502 });
      }
    },
  };
}

export function bearerToken(request: Request): string {
  const value = request.headers.get("authorization");

  if (!value?.startsWith("Bearer ") || !value.slice(7).trim()) {
    throw new ApiError({ code: "UNAUTHORIZED", message: "A bearer token is required", status: 401 });
  }

  return value.slice(7).trim();
}

export async function hashKey(key: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));

  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return `bg_live_sk_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
