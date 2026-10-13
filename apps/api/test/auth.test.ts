import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { createAuth } from "../src/auth";

const url = "https://project.supabase.co";

const config = { url, publishableKey: "public-test-key", secretKey: "secret-test-key" };

describe("Supabase signing key migration", () => {
  it.each(["ES256", "RS256"])("validates %s against Supabase JWKS and rejects invalid claims", async (algorithm) => {
    const { privateKey, publicKey } = await generateKeyPair(algorithm);
    const jwk = await exportJWK(publicKey);
    const fetcher = vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: "current", alg: algorithm, use: "sig" }] }));
    const auth = createAuth(config, fetcher);

    const sign = (issuer: string, audience: string, expires: string, role = "authenticated") => new SignJWT({ role })
      .setProtectedHeader({ alg: algorithm, kid: "current" }).setSubject("user-id")
      .setIssuedAt().setExpirationTime(expires).setIssuer(issuer).setAudience(audience).sign(privateKey);

    expect(await auth.verify(await sign(`${url}/auth/v1`, "authenticated", "5m"))).toBe("user-id");
    expect(fetcher).toHaveBeenCalledTimes(1);

    for (const token of [
      await sign("https://other.supabase.co/auth/v1", "authenticated", "5m"),
      await sign(`${url}/auth/v1`, "wrong-audience", "5m"),
      await sign(`${url}/auth/v1`, "authenticated", "-1m"),
      await sign(`${url}/auth/v1`, "authenticated", "5m", "service_role"),
    ]) {
      await expect(auth.verify(token)).rejects.toMatchObject({ status: 401, code: "INVALID_TOKEN" });
    }

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("delegates legacy HS256 sessions to Supabase and never trusts local decoded claims", async () => {
    const token = await new SignJWT({ sub: "forged-local-id" }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("test-only-secret"));
    const fetcher = vi.fn(async () => Response.json({ id: "supabase-verified-id", aud: "authenticated" }));
    const auth = createAuth(config, fetcher);

    expect(await auth.verify(token)).toBe("supabase-verified-id");
    expect(fetcher).toHaveBeenCalledWith(`${url}/auth/v1/user`, expect.objectContaining({ headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` } }));
    fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(auth.verify(token)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects malformed tokens without a network call", async () => {
    const fetcher = vi.fn(async () => new Response(null));

    await expect(createAuth(config, fetcher).verify("not-a-jwt")).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
