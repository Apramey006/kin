begin;
insert into auth.users(id) values('61111111-1111-4111-8111-111111111111'),('62222222-2222-4222-8222-222222222222'),('63333333-3333-4333-8333-333333333333');
set local role authenticated;
select set_config('request.jwt.claim.sub','61111111-1111-4111-8111-111111111111',true);
select public.create_kin_family('Rosa','Maya','granddaughter');
reset role;
insert into public.family_invites(token,family_id,role) select '64444444-4444-4444-8444-444444444444',family_id,'loved_one' from public.family_members where user_id='61111111-1111-4111-8111-111111111111';
insert into public.family_invites(token,family_id,role) select '65555555-5555-4555-8555-555555555555',family_id,'loved_one' from public.family_members where user_id='61111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub','62222222-2222-4222-8222-222222222222',true);
select public.join_kin_family('64444444-4444-4444-8444-444444444444',null,null);
do $$ begin
 if (select role from public.family_members where user_id=auth.uid()) <> 'loved_one' then raise exception 'Wrong role for loved one'; end if;
 if (select relative_id from public.family_members where user_id=auth.uid()) is not null then raise exception 'Loved one is incorrectly a contributor'; end if;
 if (select count(*) from public.relatives) <> 1 then raise exception 'Loved one was added to Keepers'; end if;
 if (select name from public.wearer) <> 'Rosa' then raise exception 'Wrong family'; end if;
 if (select count(*) from public.family_invites) <> 0 then raise exception 'Loved one can see invite secrets'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.family_invites where token='64444444-4444-4444-8444-444444444444' and used_at is not null) then raise exception 'Loved one invite was not consumed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','63333333-3333-4333-8333-333333333333',true);
do $$ begin
 begin
  perform public.join_kin_family('64444444-4444-4444-8444-444444444444','Impostor','friend');
  raise exception 'Consumed invite reused';
 exception when raise_exception then
  if SQLERRM <> 'This invitation has expired or has already been used' then raise; end if;
 end;
 begin
  perform public.join_kin_family('65555555-5555-4555-8555-555555555555','Impostor','friend');
  raise exception 'Second loved one admitted';
 exception when raise_exception then
  if SQLERRM <> 'Your loved one already has an account in this family' then raise; end if;
 end;
 if (select count(*) from public.family_members where user_id=auth.uid())<>0 then raise exception 'Rejected claim left membership'; end if;
 if (select count(*) from public.wearer)<>0 then raise exception 'Rejected claim leaked family'; end if;
end $$;
reset role;
rollback;
