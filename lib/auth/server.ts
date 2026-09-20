import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getServiceClient } from "../supabase";

export class AccessError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function getAuthClient() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, {
      cookies: { getAll: () => jar.getAll(), setAll: values => {
        try { values.forEach(({name,value,options}) => jar.set(name,value,options)); } catch { /* refreshed by middleware */ }
      } },
    });
}
export async function requireUser() {
  const auth = await getAuthClient();
  const {data:{user},error} = await auth.auth.getUser();
  if(error || !user) throw new AccessError("Please sign in to continue.",401);
  return {user,auth};
}
const missingTable = (error: {code?: string} | null) => error && ["42P01","PGRST205"].includes(error.code ?? "");

/** New account rows and existing admin-provisioned accounts share the same UI. */
export async function accountMembership(sb: SupabaseClient, user: User) {
  const member = await sb.from("family_members").select("*").eq("user_id",user.id).maybeSingle();
  if(member.error && !missingTable(member.error)) throw member.error;
  if(member.data) return member.data as {user_id:string; family_id:string; relative_id:string|null; role:"contributor"|"loved_one"};
  const claims = user.app_metadata;
  if(typeof claims.kin_family_id !== "string") return null;
  if(claims.kin_role === "wearer") {
    const result = await sb.from("wearer_accounts").select("user_id").eq("user_id",user.id).eq("family_id",claims.kin_family_id).maybeSingle();
    if(result.error) throw result.error;
    return result.data ? {user_id:user.id,family_id:claims.kin_family_id,relative_id:null,role:"loved_one" as const} : null;
  }
  if(typeof claims.kin_contributor_id !== "string") return null;
  const result = await sb.from("relatives").select("id").eq("id",claims.kin_contributor_id).eq("family_id",claims.kin_family_id).maybeSingle();
  if(result.error) throw result.error;
  return result.data ? {user_id:user.id,family_id:claims.kin_family_id,relative_id:result.data.id,role:"contributor" as const} : null;
}
export async function requireFamily(options: {contributor?:boolean} = {}) {
  const {user,auth} = await requireUser();
  const sb = getServiceClient();
  const member = await accountMembership(sb,user);
  if(!member) throw new AccessError("Finish setting up your family first.",409);
  if(options.contributor && member.role === "loved_one") throw new AccessError("Only family contributors can change memories.",403);
  const family = await sb.from("families").select("owner_id").eq("id",member.family_id).maybeSingle();
  if(family.error && !missingTable(family.error)) throw family.error;
  const isOwner = member.role !== "loved_one" && (family.data?.owner_id === user.id ||
    (!family.data?.owner_id && user.app_metadata.kin_family_id === member.family_id && user.app_metadata.kin_admin === true));
  return {sb,auth,user,familyId:member.family_id,relativeId:member.relative_id,role:member.role,isOwner};
}
export function requireContributor(actual:string|null,requested:unknown) {
  if(!actual || actual !== requested) throw new AccessError("You can only change your own contributions.",403);
}
