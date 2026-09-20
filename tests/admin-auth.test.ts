import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getServiceClient: vi.fn(), resetFamily: vi.fn(), seedDemo: vi.fn(), runWeaver: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getServiceClient: mocks.getServiceClient }));
vi.mock("@/lib/seed", () => ({ resetFamily: mocks.resetFamily, seedDemo: mocks.seedDemo }));
vi.mock("@/lib/weaver", () => ({ runWeaver: mocks.runWeaver }));
import { POST as reset } from "../app/api/admin/reset/route";
import { POST as seed } from "../app/api/admin/seed/route";
import { POST as weaver } from "../app/api/weaver/run/route";

const contributor = "10000000-0000-4000-8000-000000000001";
const request = (authenticated = true) => new Request("http://localhost/api/admin/seed", {
  method: "POST", headers: authenticated ? { authorization: "Bearer demo-session" } : {},
});
let admin = false;
beforeEach(() => {
  vi.clearAllMocks(); admin = false;
  mocks.getServiceClient.mockReturnValue({ auth: { getUser: async () => ({ error: null,
    data: { user: { id: "user", app_metadata: { kin_family_id: "owned-family", kin_contributor_id: contributor, kin_admin: admin } } } }) },
  from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ error: null,
    data: { id: contributor, family_id: "owned-family", name: "Maya" } }) }; return q; } });
  mocks.seedDemo.mockResolvedValue({ memoryCount: 12 });
  mocks.runWeaver.mockResolvedValue({ question: null, gap: null, reason: "no_gap" });
});
describe("protected demo management", () => {
  it.each([reset, seed, weaver])("requires auth before mutations", async (route) => {
    expect((await route(request(false))).status).toBe(401);
    expect(mocks.resetFamily).not.toHaveBeenCalled();
    expect(mocks.seedDemo).not.toHaveBeenCalled();
    expect(mocks.runWeaver).not.toHaveBeenCalled();
  });
  it.each([reset, seed])("requires admin claim for destructive demo controls", async (route) => {
    expect((await route(request())).status).toBe(403);
    expect(mocks.resetFamily).not.toHaveBeenCalled();
    expect(mocks.seedDemo).not.toHaveBeenCalled();
  });
  it("uses the authenticated family for admin seed and reset", async () => {
    admin = true;
    expect((await seed(request())).status).toBe(200);
    expect((await reset(request())).status).toBe(200);
    expect(mocks.seedDemo).toHaveBeenCalledWith(expect.anything(), "owned-family");
    expect(mocks.resetFamily).toHaveBeenCalledWith(expect.anything(), "owned-family");
  });
  it("allows provisioned relatives to run Weaver for their family", async () => {
    expect((await weaver(request())).status).toBe(200);
    expect(mocks.runWeaver).toHaveBeenCalledWith(expect.anything(), "owned-family");
  });
});
