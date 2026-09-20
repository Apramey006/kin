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
commit;
