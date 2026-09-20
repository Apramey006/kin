begin;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.create_kin_family('Loved one A','Owner A','daughter');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.create_kin_family('Loved one B','Owner B','son');
do $$ begin
  if (select count(*) from public.wearer) <> 1 then raise exception 'Cross-family wearer leak'; end if;
  if (select count(*) from public.relatives) <> 1 then raise exception 'Cross-family relative leak'; end if;
  if (select count(*) from public.family_members) <> 1 then raise exception 'Cross-family membership leak'; end if;
  if (select name from public.wearer) <> 'Loved one B' then raise exception 'Wrong family visible'; end if;
  begin
    perform public.create_kin_family('Unwanted duplicate','Other','friend');
    raise exception 'Duplicate family creation succeeded';
  exception when raise_exception then
    if SQLERRM <> 'Already a family member' then raise; end if;
  end;
end $$;
reset role;
insert into public.family_invites(token,family_id) select '44444444-4444-4444-8444-444444444444',family_id from public.family_members where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select public.join_kin_family('44444444-4444-4444-8444-444444444444','Member C','son');
do $$ begin
  if (select name from public.wearer) <> 'Loved one A' then raise exception 'Invitation joined wrong family'; end if;
  if (select count(*) from public.relatives) <> 2 then raise exception 'Shared family not visible'; end if;
  if (select count(*) from public.family_invites) <> 0 then raise exception 'Non-owner can read invitations'; end if;
end $$;
reset role;
grant select on public.wearer,public.memories,public.face_embeddings to anon;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if (select count(*) from public.wearer) <> 0 then raise exception 'Anonymous family leak'; end if;
  if has_function_privilege('anon','public.create_kin_family(text,text,text)','EXECUTE') then raise exception 'Anonymous onboarding enabled'; end if;
  if has_function_privilege('anon','public.match_faces(vector,text,integer)','EXECUTE') then raise exception 'Anonymous matching enabled'; end if;
end $$;
reset role;
do $$ begin
 if (select public from storage.buckets where id='media') then raise exception 'Media bucket is still public'; end if;
end $$;
rollback;
