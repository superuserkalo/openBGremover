import { Schema } from "effect";
import { ApiFailure } from "@openbg/contracts";
import { supabase } from "./supabase";

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The request could not be completed";
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_API_URL;

  if (!base) throw new Error("NEXT_PUBLIC_API_URL is not configured");

  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) throw new Error("Sign in to continue");

  const headers = new Headers(init.headers);

  headers.set("Authorization", `Bearer ${session.access_token}`);

  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, { ...init, headers });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      message = Schema.decodeUnknownSync(ApiFailure)(await response.json()).error;
    } catch {
      // Proxies can return non-JSON errors; preserve the HTTP status in that case.
    }

    throw new Error(message);
  }

  return response;
}

export async function apiRequest<A>(path: string, schema: Schema.Codec<A>, init: RequestInit = {}): Promise<A> {
  const headers = new Headers(init.headers);

  if (init.body) headers.set("Content-Type", "application/json");

  const response = await apiFetch(path, { ...init, headers });

  return Schema.decodeUnknownSync(schema)(await response.json());
}
