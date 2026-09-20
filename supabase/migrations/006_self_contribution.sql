-- The wearer contributes their own memories.
--
-- A wearer becomes a Keeper owner like any relative, so their stories flow
-- through the existing ingestion, retrieval and provenance paths unchanged.
-- No gate change is needed: evaluateGate already requires two distinct
-- contributors, so a self-memory can corroborate but never speak alone.
--
-- Capture is bounded. While `self_capture_open` is true, self contributions
-- commit directly. Once the family closes the window, the wearer keeps
-- recording exactly as before, but each contribution parks in
-- `pending_contributions` until a contributor approves it. The wearer never
-- sees a door close; only what the system does with the recording changes.
begin;

alter table public.relatives add column if not exists is_self boolean not null default false;
create unique index if not exists relatives_one_self_per_family on public.relatives(family_id) where is_self;

-- Only meaningful on the is_self row. True = self contributions commit directly.
alter table public.relatives add column if not exists self_capture_open boolean not null default true;

-- A self contribution recorded after the window closed, held for family review.
-- `payload` is the exact commit_ingestion argument, replayed verbatim on approval.
create table if not exists public.pending_contributions (
  id uuid primary key,
  family_id text not null,
  contributor_id uuid not null references public.relatives(id) on delete cascade,
  kind text not null check (kind in ('photo','story','answer')),
  preview text not null,                -- the wearer's own words, for the reviewer
  media_path text,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending','approved','rejected')),
  reviewed_by uuid references public.relatives(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pending_contributions_family_state
  on public.pending_contributions(family_id, state, created_at desc);

alter table public.pending_contributions enable row level security;
revoke all on public.pending_contributions from anon, authenticated;
grant select on public.pending_contributions to authenticated;
grant all on public.pending_contributions to service_role;

-- Contributors review; the wearer never reads their own review queue.
create policy family_pending_read on public.pending_contributions for select to authenticated using (
  family_id = (auth.jwt()->'app_metadata'->>'kin_family_id')
  and public.kin_has_membership()
  and coalesce(auth.jwt()->'app_metadata'->>'kin_role', '') is distinct from 'wearer'
);

commit;
