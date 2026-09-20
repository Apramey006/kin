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
drop policy if exists family_pending_read on public.pending_contributions;
create policy family_pending_read on public.pending_contributions for select to authenticated using (
  family_id = (auth.jwt()->'app_metadata'->>'kin_family_id')
  and public.kin_has_membership()
  and coalesce(auth.jwt()->'app_metadata'->>'kin_role', '') is distinct from 'wearer'
);

-- Serialize capture, retries and review with commit_ingestion's family lock.
-- Lock order is always family advisory lock, then relative/queue row locks.
create or replace function public.capture_self_contribution(payload jsonb, preview text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  family text := payload->>'family_id';
  owner uuid := (payload->>'contributor_id')::uuid;
  operation uuid := (payload->>'id')::uuid;
  keeper public.relatives%rowtype;
  held public.pending_contributions%rowtype;
  receipt public.ingestion_receipts%rowtype;
begin
  if family is null or owner is null or operation is null
    or payload->>'request_hash' is null or payload->'response' is null
    or payload->'source'->>'type' is distinct from 'human'
    or payload->'memory'->>'id' is distinct from operation::text
    or payload->'memory'->>'family_id' is distinct from family
    or payload->'memory'->>'contributor_id' is distinct from owner::text then
    raise exception 'Invalid self contribution' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(family, 0));
  select * into keeper from public.relatives where id = owner and family_id = family and is_self for update;
  if not found then raise exception 'Self membership required' using errcode = '42501'; end if;
  select * into held from public.pending_contributions where id = operation for update;
  if found then
    if held.family_id is distinct from family or held.contributor_id is distinct from owner
      or held.payload->>'request_hash' is distinct from payload->>'request_hash' then
      raise exception 'Idempotency conflict' using errcode = '23505';
    end if;
    if held.state = 'rejected' then raise exception 'Contribution rejected' using errcode = '23505'; end if;
    return (held.payload->'response') || jsonb_build_object('pending_review', held.state = 'pending');
  end if;
  select * into receipt from public.ingestion_receipts where id = operation;
  if found then
    return public.commit_ingestion(payload); -- validates receipt ownership and hash
  end if;
  if keeper.self_capture_open then return public.commit_ingestion(payload); end if;
  insert into public.pending_contributions(id, family_id, contributor_id, kind, preview, media_path, payload)
    values(operation, family, owner, payload->'memory'->>'kind', left(preview, 2000),
      payload->'memory'->>'media_path', payload);
  return (payload->'response') || jsonb_build_object('pending_review', true);
end;
$$;

create or replace function public.review_self_contribution(family text, reviewer uuid, contribution uuid, decision text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  held public.pending_contributions%rowtype;
  target_state text;
  result jsonb;
begin
  if decision not in ('approve', 'reject') or decision is null then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(family, 0));
  if not exists(select 1 from public.relatives where id = reviewer and family_id = family and not is_self) then
    raise exception 'Family reviewer required' using errcode = '42501';
  end if;
  select * into held from public.pending_contributions where id = contribution and family_id = family for update;
  if not found then raise exception 'Contribution not found' using errcode = 'P0002'; end if;
  target_state := case decision when 'approve' then 'approved' else 'rejected' end;
  if held.state <> 'pending' and held.state <> target_state then
    raise exception 'Contribution already reviewed' using errcode = '23505';
  end if;
  if target_state = 'approved' then result := public.commit_ingestion(held.payload); end if;
  if held.state = 'pending' then
    update public.pending_contributions set state = target_state, reviewed_by = reviewer, reviewed_at = now()
      where id = contribution;
  end if;
  return jsonb_build_object('id', contribution, 'state', target_state, 'result', result);
end;
$$;

revoke all on function public.capture_self_contribution(jsonb, text) from public, anon, authenticated;
revoke all on function public.review_self_contribution(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.capture_self_contribution(jsonb, text) to service_role;
grant execute on function public.review_self_contribution(text, uuid, uuid, text) to service_role;

commit;
