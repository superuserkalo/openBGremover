import type { Activity, ApiKey, Stats } from "@openbg/contracts";
import { ApiError } from "./errors";

export type Credit = "free" | "bulk";

export interface StoredKey {
  id: number;
  user_id: string | null;
  is_service: boolean;
  scopes: string[];
}

export interface Usage {
  userId: string;
  keyId: number | null;
  source: "ui" | "api";
  credit: Credit;
  success: boolean;
  error: string | null;
  milliseconds: number;
}

export interface Database {
  findKey(hash: string): Promise<StoredKey | null>;
  createKey(userId: string, name: string, hash: string, prefix: string): Promise<number>;
  listKeys(userId: string): Promise<readonly ApiKey[]>;
  deleteKey(userId: string, id: number): Promise<void>;
  stats(userId: string): Promise<Stats>;
  activity(userId: string, limit: number, offset: number): Promise<readonly Activity[]>;
  reserveCredit(userId: string): Promise<Credit>;
  recordUsage(usage: Usage): Promise<void>;
  deleteUserData(userId: string): Promise<void>;
}

interface Balance {
  free_images_remaining: number;
  bulk_images_remaining: number;
}

export interface Sql {
  query<Row extends object>(text: string, values?: readonly (string | number | boolean | null)[]): Promise<{ rows: Row[]; rowCount: number | null }>;
}

/** All SQL lives here. The HTTP and processing modules do not know the table layout. */
export function createDatabase(client: Sql): Database {
  async function transaction<A>(operation: () => Promise<A>): Promise<A> {
    await client.query("BEGIN");

    try {
      const result = await operation();

      await client.query("COMMIT");

      return result;
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    }
  }

  return {
    async findKey(hash) {
      const result = await client.query<StoredKey>(`
        SELECT id::float8 AS id, user_id, COALESCE(is_service, false) AS is_service,
          COALESCE(scopes, '{}'::text[]) AS scopes
        FROM api_keys WHERE hashed_key = $1 AND is_active = true`, [hash]);

      const key = result.rows[0];

      if (key) await client.query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", [key.id]);

      return key ?? null;
    },
    async createKey(userId, name, hash, prefix) {
      const result = await client.query<{ id: number }>(`
        INSERT INTO api_keys (user_id, key_name, hashed_key, key_prefix, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, true, NOW(), NOW()) RETURNING id::float8 AS id`, [userId, name, hash, prefix]);

      const row = result.rows[0];

      if (!row) throw new Error("API key insert returned no row");

      return row.id;
    },
    async listKeys(userId) {
      const result = await client.query<ApiKey>(`
        SELECT id::float8 AS id, key_name AS name, key_prefix AS prefix, is_active,
          EXTRACT(EPOCH FROM created_at)::float8 AS created_at,
          EXTRACT(EPOCH FROM last_used_at)::float8 AS last_used_at
        FROM api_keys WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC`, [userId]);

      return result.rows;
    },
    async deleteKey(userId, id) {
      const result = await client.query(`
        UPDATE api_keys SET is_active = false, updated_at = NOW()
        WHERE id = $1 AND user_id = $2 AND is_active = true`, [id, userId]);

      if (!result.rowCount) throw new ApiError({ code: "API_KEY_NOT_FOUND", message: "API key not found", status: 404 });
    },
    async stats(userId) {
      const result = await client.query<Stats>(`
        SELECT true AS success,
          (SELECT COUNT(*)::int FROM usage_logs WHERE user_id = p.id AND source IN ('ui', 'api')) AS api_calls_total,
          (SELECT COUNT(*)::int FROM usage_logs WHERE user_id = p.id AND source IN ('ui', 'api') AND was_successful) AS images_processed,
          (SELECT COUNT(*)::int FROM usage_logs WHERE user_id = p.id AND source IN ('ui', 'api') AND was_successful
            AND created_at >= date_trunc('month', NOW())) AS images_this_month,
          free_images_remaining::float8 AS free_credits_remaining, bulk_images_remaining::float8 AS bulk_credits_remaining,
          current_billing_model AS billing_model
        FROM profiles p WHERE id = $1`, [userId]);

      const row = result.rows[0];

      if (!row) throw new ApiError({ code: "PROFILE_NOT_FOUND", message: "Account profile not found", status: 404 });

      return row;
    },
    async activity(userId, limit, offset) {
      const result = await client.query<Activity>(`
        SELECT id::float8 AS id, source, was_successful, error_message, processing_time_ms,
          credit_type_used AS credit_type, EXTRACT(EPOCH FROM created_at)::float8 AS created_at
        FROM usage_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]);

      return result.rows;
    },
    async reserveCredit(userId) {
      return transaction(async () => {
        const result = await client.query<Balance>(`
          SELECT free_images_remaining::float8 AS free_images_remaining,
            bulk_images_remaining::float8 AS bulk_images_remaining FROM profiles WHERE id = $1 FOR UPDATE`, [userId]);

        const balance = result.rows[0];

        if (!balance || (balance.free_images_remaining <= 0 && balance.bulk_images_remaining <= 0)) {
          throw new ApiError({ code: "INSUFFICIENT_CREDITS", message: "No image credits remaining", status: 402 });
        }

        const credit = balance.free_images_remaining > 0 ? "free" : "bulk";
        // The column is selected from two constants, never from request data.
        const column = credit === "free" ? "free_images_remaining" : "bulk_images_remaining";

        await client.query(`UPDATE profiles SET ${column} = ${column} - 1, updated_at = NOW() WHERE id = $1`, [userId]);

        return credit;
      });
    },
    async recordUsage(usage) {
      await transaction(async () => {
        if (!usage.success) {
          const column = usage.credit === "free" ? "free_images_remaining" : "bulk_images_remaining";

          await client.query(`UPDATE profiles SET ${column} = ${column} + 1, updated_at = NOW() WHERE id = $1`, [usage.userId]);
        }

        await client.query(`
          INSERT INTO usage_logs (user_id, api_key_id, source, was_successful, error_message, processing_time_ms, credit_type_used)
          VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [usage.userId, usage.keyId, usage.source, usage.success, usage.error, usage.milliseconds, usage.credit]);
      });
    },
    async deleteUserData(userId) {
      await transaction(async () => {
        await client.query("DELETE FROM usage_logs WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM api_keys WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM profiles WHERE id = $1", [userId]);
      });
    },
  };
}
