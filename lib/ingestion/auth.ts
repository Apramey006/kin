import type { SupabaseClient } from "@supabase/supabase-js";
import type { Relative } from "@/lib/types";
import { familySchema, idSchema, IngestionError } from "./http";

export interface IngestionIdentity {
  userId: string;
  familyId: string;
  contributorId: string;
  contributor: Relative;
  isAdmin: boolean;
}

export async function authenticateFamily(req: Request, sb: SupabaseClient) {
  const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw new IngestionError(401, "Authentication required");
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new IngestionError(401, "Invalid authentication");
  const family = familySchema.safeParse(data.user.app_metadata.kin_family_id);
  if (!family.success) throw new IngestionError(403, "Family membership is not provisioned");
  if (data.user.app_metadata.kin_role === "wearer") {
    const membership = await sb.from("wearer_accounts").select("user_id")
      .eq("user_id", data.user.id).eq("family_id", family.data).maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) throw new IngestionError(403, "Wearer membership required");
    return { userId: data.user.id, familyId: family.data, contributorId: null, contributor: null, isAdmin: false };
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
    isAdmin: data.user.app_metadata.kin_admin === true };
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
