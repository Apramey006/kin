import type { SupabaseClient } from "@supabase/supabase-js";
import type { Relative } from "@/lib/types";
import { familySchema, idSchema, IngestionError } from "./http";

export interface IngestionIdentity {
  userId: string;
  familyId: string;
  contributorId: string;
  contributor: Relative;
  isAdmin: boolean;
  /** The wearer contributing about their own life. */
  isSelf: boolean;
}

export async function authenticateFamily(req: Request, sb: SupabaseClient) {
  const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) {
    // Redesigned web screens use verified Supabase cookies. Existing bearer
    // clients retain the original contract and server-owned face pipeline.
    let context;
    try { context = await (await import("../auth/server")).requireFamily(); }
    catch (error) {
      const status = error instanceof Error && "status" in error ? Number(error.status) : 401;
      throw new IngestionError(status === 409 ? 403 : status, "Authentication or family membership required");
    }
    if (context.role === "loved_one") {
      const self = await sb.from("relatives").select("*").eq("family_id", context.familyId).eq("is_self", true).maybeSingle();
      if (self.error && !["42703", "PGRST204", "PGRST205"].includes(self.error.code)) throw self.error;
      return {userId:context.user.id, familyId:context.familyId, isAdmin:false, isSelf:true,
        contributorId:(self.data?.id as string | undefined) ?? null, contributor:(self.data as Relative | null) ?? null};
    }
    const contributor = await sb.from("relatives").select("*").eq("id",context.relativeId).eq("family_id",context.familyId).single();
    if(contributor.error) throw contributor.error;
    return {userId:context.user.id,familyId:context.familyId,contributorId:contributor.data.id,
      contributor:contributor.data as Relative,isAdmin:context.isOwner,isSelf:contributor.data.is_self === true};
  }
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new IngestionError(401, "Invalid authentication");
  const family = familySchema.safeParse(data.user.app_metadata.kin_family_id);
  if (!family.success) throw new IngestionError(403, "Family membership is not provisioned");
  if (data.user.app_metadata.kin_role === "wearer") {
    const membership = await sb.from("wearer_accounts").select("user_id")
      .eq("user_id", data.user.id).eq("family_id", family.data).maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) throw new IngestionError(403, "Wearer membership required");
    // The wearer contributes through the family's `is_self` Keeper when one is
    // provisioned. Recall is unaffected either way; without it they stay
    // read-only exactly as before.
    // Before migration 007 the column does not exist. That is not an outage:
    // the wearer stays read-only exactly as they were, and recall must keep
    // working. Only an unexpected failure is escalated.
    const self = await sb.from("relatives").select("*")
      .eq("family_id", family.data).eq("is_self", true).maybeSingle();
    if (self.error && !["42703", "PGRST204", "PGRST205"].includes(self.error.code)) throw self.error;
    return { userId: data.user.id, familyId: family.data, isAdmin: false, isSelf: true,
      contributorId: (self.data?.id as string | undefined) ?? null, contributor: (self.data as Relative | null) ?? null };
  }
  const contributor = idSchema.safeParse(data.user.app_metadata.kin_contributor_id);
  if (!family.success || !contributor.success) {
    throw new IngestionError(403, "Family membership is not provisioned");
  }
  const result = await sb.from("relatives").select("*")
    .eq("id", contributor.data).eq("family_id", family.data).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new IngestionError(403, "Family membership required");
  return { userId: data.user.id, familyId: family.data, contributorId: contributor.data, contributor: result.data,
    isAdmin: data.user.app_metadata.kin_admin === true, isSelf: result.data.is_self === true };
}

export async function authenticateIngestion(req: Request, sb: SupabaseClient): Promise<IngestionIdentity> {
  const identity = await authenticateFamily(req, sb);
  if (!identity.contributorId || !identity.contributor) throw new IngestionError(403, "Contributor membership required");
  return { ...identity, contributorId: identity.contributorId, contributor: identity.contributor };
}

export async function authenticateAdmin(req: Request, sb: SupabaseClient) {
  const identity = await authenticateIngestion(req, sb);
  if (!identity.isAdmin) throw new IngestionError(403, "Demo administrator required");
  return identity;
}

export function assertOwnership(identity: IngestionIdentity, contributor: unknown, family?: unknown) {
  const contributorId = idSchema.parse(contributor);
  if (contributorId !== identity.contributorId) throw new IngestionError(403, "Contributor mismatch");
  if (family != null && familySchema.parse(family) !== identity.familyId) {
    throw new IngestionError(403, "Family mismatch");
  }
}
