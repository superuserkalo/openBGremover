-- Enforce key and balance invariants in the database, and close the Data API
-- roles' access to application tables. Every client goes through the HTTP API,
-- which connects as the table owner; nothing uses PostgREST for these tables.

-- Production data had no duplicate hashes or negative balances when this was
-- written. Credit reservation already checks balances under a row lock; these
-- constraints are the backstop.
ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_hashed_key_key UNIQUE (hashed_key);
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_free_images_remaining_check CHECK (free_images_remaining >= 0),
  ADD CONSTRAINT profiles_bulk_images_remaining_check CHECK (bulk_images_remaining >= 0);

-- RLS does not cover TRUNCATE, so revoke grants rather than relying on the
-- absence of policies.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- The signup trigger runs as the table owner and does not need this policy. It
-- let a signed-in user insert their own profile with any credit balance.
DROP POLICY "Insert profile on signup" ON public.profiles;
