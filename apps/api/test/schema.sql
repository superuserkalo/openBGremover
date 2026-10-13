-- Local test schema matching the columns used by the existing Supabase application.
CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  current_billing_model text NOT NULL DEFAULT 'free_tier',
  free_images_remaining bigint NOT NULL DEFAULT 50 CHECK (free_images_remaining >= 0),
  bulk_images_remaining bigint NOT NULL DEFAULT 0 CHECK (bulk_images_remaining >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE api_keys (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  key_name text NOT NULL,
  hashed_key text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  last_used_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  is_service boolean NOT NULL DEFAULT false,
  scopes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE usage_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id),
  api_key_id bigint REFERENCES api_keys(id),
  source text NOT NULL,
  was_successful boolean NOT NULL,
  error_message text,
  processing_time_ms integer,
  credit_type_used text,
  created_at timestamptz NOT NULL DEFAULT now()
);
