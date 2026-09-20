import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestionIdentity } from "../lib/ingestion/auth";
const h = vi.hoisted(() => ({ rpc: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getServiceClient: () => ({ rpc: h.rpc }) }));
vi.mock("@/lib/ingestion/auth", () => ({ authenticateIngestion: h.auth }));
import { POST } from "../app/api/self/review/route";
import { existingSelfContribution } from "../lib/ingestion/self";

const identity = { familyId: "canonical", contributorId: "reviewer", isSelf: false } as IngestionIdentity;
const id = "11111111-1111-4111-8111-111111111111";
const request = () => new Request("http://localhost/api/self/review", { method: "POST", body: JSON.stringify({ id, action: "approve" }) });
beforeEach(() => { vi.resetAllMocks(); h.auth.mockResolvedValue(identity); });

it("submits the authenticated family and reviewer to one atomic decision RPC", async () => {
  h.rpc.mockResolvedValue({ data: { id, state: "approved" }, error: null });
  const res = await POST(request());
  expect(res.status).toBe(200);
  expect(h.rpc).toHaveBeenCalledExactlyOnceWith("review_self_contribution", {
    family: "canonical", reviewer: "reviewer", contribution: id, decision: "approve",
  });
});
it.each([["23505",409],["P0002",404],["42501",403],["PGRST202",503]])("maps %s to HTTP %s", async (code,status) => {
  h.rpc.mockResolvedValue({ data: null, error: { code } });
  expect((await POST(request())).status).toBe(status);
});
it("rejects wearer review before calling the service RPC", async () => {
  h.auth.mockResolvedValue({ ...identity, isSelf: true });
  expect((await POST(request())).status).toBe(403);
  expect(h.rpc).not.toHaveBeenCalled();
});
it("returns the original pending response and refuses rejected or changed retries", async () => {
  const row = { payload: { request_hash: "original", response: { memory_id: id } }, state: "pending" };
  const filters: unknown[] = [];
  const query = { select: () => query, eq: (...args: unknown[]) => { filters.push(args); return query; },
    maybeSingle: async () => ({ data: row, error: null }) };
  const sb = { from: () => query } as unknown as SupabaseClient;
  expect(await existingSelfContribution(sb,identity,id,"original")).toEqual({ memory_id: id, pending_review: true });
  expect(filters).toContainEqual(["family_id","canonical"]);
  expect(filters).toContainEqual(["contributor_id","reviewer"]);
  await expect(existingSelfContribution(sb,identity,id,"changed")).rejects.toMatchObject({ status: 409 });
  row.state = "rejected";
  await expect(existingSelfContribution(sb,identity,id,"original")).rejects.toMatchObject({ status: 409 });
});
