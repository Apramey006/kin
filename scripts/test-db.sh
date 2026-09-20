#!/usr/bin/env bash
# Linux/Docker integration check. Never connects to the configured Supabase project.
set -euo pipefail
cd "$(dirname "$0")/.."
db_container="kin-test-db-$$"
rest_container="kin-test-rest-$$"
cleanup() { docker stop "$rest_container" "$db_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --rm -d --name "$db_container" --network host \
  -e POSTGRES_PASSWORD=kin-local-test-only -e POSTGRES_DB=kin_test \
  pgvector/pgvector:pg16 postgres -p 15432 -c listen_addresses=127.0.0.1 -c wal_level=logical >/dev/null
for attempt in {1..30}; do
  if docker exec "$db_container" pg_isready -p 15432 -U postgres -d kin_test >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$db_container" psql -p 15432 -U postgres -d kin_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text primary key, name text, public boolean);
CREATE PUBLICATION supabase_realtime;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid primary key);
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
SQL
for sql in supabase/migrations/001_init.sql supabase/migrations/002_demo_reliability.sql supabase/migrations/003_accounts.sql supabase/migrations/004_loved_one_invites.sql supabase/migrations/005_living_stories.sql tests/sql/face-retrieval.sql tests/sql/accounts.sql tests/sql/loved-one.sql; do
  docker exec -i "$db_container" psql -p 15432 -U postgres -d kin_test -v ON_ERROR_STOP=1 < "$sql"
done

docker run --rm -d --name "$rest_container" --network host \
  -e PGRST_DB_URI=postgres://postgres:kin-local-test-only@127.0.0.1:15432/kin_test \
  -e PGRST_DB_ANON_ROLE=postgres -e PGRST_SERVER_HOST=127.0.0.1 -e PGRST_SERVER_PORT=15433 \
  postgrest/postgrest:v12.2.12 >/dev/null
for attempt in {1..30}; do
  if curl --silent --fail http://127.0.0.1:15433/relatives >/dev/null; then break; fi
  sleep 1
done
KIN_TEST_DATABASE=1 npm test -- tests/demo.integration.test.ts
