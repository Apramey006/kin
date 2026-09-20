begin;
-- A wearer is a family member, not an owner of a contributor Keeper.
create table public.wearer_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  family_id text not null references public.wearer(family_id),
  unique (user_id, family_id)
);
alter table public.wearer_accounts enable row level security;
revoke all on public.wearer_accounts from anon, authenticated;
grant select on public.wearer_accounts to authenticated;
grant all on public.wearer_accounts to service_role;
create policy own_wearer_membership on public.wearer_accounts for select to authenticated using (
  user_id::text = auth.jwt()->>'sub' and family_id = auth.jwt()->'app_metadata'->>'kin_family_id'
);
create or replace function public.kin_has_membership() returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select case when auth.jwt()->'app_metadata'->>'kin_role' = 'wearer' then
    exists (select 1 from public.wearer_accounts w where w.user_id::text = auth.jwt()->>'sub'
      and w.family_id = auth.jwt()->'app_metadata'->>'kin_family_id')
  else exists (select 1 from public.relatives r where r.id::text = auth.jwt()->'app_metadata'->>'kin_contributor_id'
    and r.family_id = auth.jwt()->'app_metadata'->>'kin_family_id') end
$$;
do $$ declare t text; begin
  foreach t in array array['relatives','wearer','memories','graph_nodes','graph_edges','recall_events','weaver_questions'] loop
    execute format('drop policy family_read on public.%I', t);
    execute format('create policy family_read on public.%I for select to authenticated using (family_id = (auth.jwt()->''app_metadata''->>''kin_family_id'') and public.kin_has_membership())', t);
  end loop;
end $$;
drop policy family_media_read on storage.objects;
create policy family_media_read on storage.objects for select to authenticated using (
  bucket_id = 'media' and (storage.foldername(name))[1] = auth.jwt()->'app_metadata'->>'kin_family_id'
  and public.kin_has_membership()
);
commit;
