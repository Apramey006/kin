-- Separate the person using recognition from the people contributing memories.
-- Existing accounts and invitations remain contributors. No memories are changed.
begin;
alter table public.family_members add column if not exists role text not null default 'contributor';
alter table public.family_members alter column relative_id drop not null;
alter table public.family_members drop constraint if exists family_member_role;
alter table public.family_members add constraint family_member_role check (
  (role = 'contributor' and relative_id is not null) or
  (role = 'loved_one' and relative_id is null)
);
create unique index if not exists one_loved_one_per_family on public.family_members(family_id) where role = 'loved_one';
alter table public.family_invites add column if not exists role text not null default 'contributor';
alter table public.family_invites add column if not exists used_at timestamptz;
alter table public.family_invites drop constraint if exists family_invite_role;
alter table public.family_invites add constraint family_invite_role check (role in ('contributor','loved_one'));

create or replace function public.join_kin_family(invite_code uuid, member_name text, relationship text)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); invitation public.family_invites%rowtype; rid uuid;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if exists(select 1 from public.family_members where user_id = uid) then raise exception 'Already a family member'; end if;
  select * into invitation from public.family_invites
    where token = invite_code and expires_at > now() and used_at is null for update;
  if invitation.token is null then raise exception 'This invitation has expired or has already been used'; end if;
  if invitation.role = 'loved_one' then
    -- Serialize claims even when an organizer created more than one invitation.
    perform pg_advisory_xact_lock(hashtextextended(invitation.family_id, 1));
    if exists(select 1 from public.family_members where family_id = invitation.family_id and role = 'loved_one') then
      raise exception 'Your loved one already has an account in this family';
    end if;
    insert into public.family_members(user_id,family_id,relative_id,role)
      values(uid,invitation.family_id,null,'loved_one');
    update public.family_invites set used_at = now() where token = invite_code;
  else
    if member_name is null or relationship is null or length(trim(member_name)) not between 1 and 80 or length(trim(relationship)) not between 1 and 60 then
      raise exception 'Please complete your name and relationship';
    end if;
    insert into public.relatives(family_id,name,relation_to_wearer,color)
      values(invitation.family_id,trim(member_name),trim(relationship),'#287D75') returning id into rid;
    insert into public.family_members(user_id,family_id,relative_id,role)
      values(uid,invitation.family_id,rid,'contributor');
  end if;
  return invitation.family_id;
end $$;
revoke all on function public.join_kin_family(uuid,text,text) from public,anon;
grant execute on function public.join_kin_family(uuid,text,text) to authenticated;
-- Preserve main's already-provisioned accounts. No memories, embeddings, or
-- existing memberships are rewritten. Claims remain admin-managed.
insert into public.families(id,owner_id)
select u.raw_app_meta_data->>'kin_family_id', u.id from auth.users u
where u.raw_app_meta_data->>'kin_admin' = 'true'
  and exists(select 1 from public.relatives r where r.id::text=u.raw_app_meta_data->>'kin_contributor_id'
    and r.family_id=u.raw_app_meta_data->>'kin_family_id')
on conflict(id) do update set owner_id=coalesce(public.families.owner_id,excluded.owner_id);
insert into public.family_members(user_id,family_id,relative_id,role)
select u.id,r.family_id,r.id,'contributor' from auth.users u
join public.relatives r on r.id::text=u.raw_app_meta_data->>'kin_contributor_id'
  and r.family_id=u.raw_app_meta_data->>'kin_family_id'
where coalesce(u.raw_app_meta_data->>'kin_role','') <> 'wearer'
on conflict do nothing;
insert into public.family_members(user_id,family_id,relative_id,role)
select w.user_id,w.family_id,null,'loved_one' from public.wearer_accounts w
join public.families f on f.id=w.family_id
on conflict do nothing;

-- Provision main's wearer membership alongside a new loved-one invitation.
-- A new wearer also receives an is_self Keeper, with review enabled by default.
create or replace function public.sync_kin_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.role='loved_one' then
    insert into public.wearer_accounts(user_id,family_id) values(new.user_id,new.family_id) on conflict(user_id) do nothing;
    insert into public.relatives(family_id,name,relation_to_wearer,color,is_self,self_capture_open)
    select new.family_id,w.name,'self','#6958C9',true,false from public.wearer w
    where w.family_id=new.family_id and not exists(select 1 from public.relatives r where r.family_id=new.family_id and r.is_self);
  end if;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb) || jsonb_build_object(
    'kin_family_id',new.family_id,'kin_contributor_id',new.relative_id,
    'kin_role',case when new.role='loved_one' then 'wearer' else 'contributor' end,
    'kin_admin',exists(select 1 from public.families f where f.id=new.family_id and f.owner_id=new.user_id)
  ) where id=new.user_id;
  return new;
end $$;
revoke all on function public.sync_kin_account() from public,anon,authenticated;
drop trigger if exists sync_kin_account on public.family_members;
create trigger sync_kin_account after insert on public.family_members for each row execute function public.sync_kin_account();
commit;
