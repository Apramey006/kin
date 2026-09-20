import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateFamily, authenticateIngestion, authenticateAdmin } from "../lib/ingestion/auth";
import { DEMO_FAMILY_ID } from "../lib/demo";

function database(member = true, family = DEMO_FAMILY_ID) {
  return { auth: { getUser: async () => ({ data: { user: { id: "rosa", app_metadata: {
    kin_role: "wearer", kin_family_id: family, kin_contributor_id: null, kin_admin: true,
  } } }, error: null }) }, from: (table: string) => {
    const filters: Record<string, unknown> = {};
    const q = { select: () => q, eq: (key: string, value: unknown) => { filters[key] = value; return q; },
      maybeSingle: async () => ({ error: null, data: member && table === "wearer_accounts" && filters.family_id === DEMO_FAMILY_ID && filters.user_id === "rosa" ? { user_id: "rosa" } : null }) };
    return q;
  } } as unknown as SupabaseClient;
}
const request = () => new Request("http://localhost/api/recall", { headers: { authorization: "Bearer test" } });
describe("Rosa's separate wearer membership", () => {
  it("authenticates recall without a contributor and cannot gain admin rights", async () => {
    expect(await authenticateFamily(request(), database())).toMatchObject({ familyId: DEMO_FAMILY_ID, contributorId: null, isAdmin: false });
    await expect(authenticateIngestion(request(), database())).rejects.toMatchObject({ status: 403 });
    await expect(authenticateAdmin(request(), database())).rejects.toMatchObject({ status: 403 });
  });
  it("requires a persisted membership for exactly the claimed family", async () => {
    await expect(authenticateFamily(request(), database(false))).rejects.toMatchObject({ status: 403 });
    await expect(authenticateFamily(request(), database(true, "another-family"))).rejects.toMatchObject({ status: 403 });
  });
});
