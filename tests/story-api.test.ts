import { beforeEach, describe, expect, it, vi } from "vitest";


const state = vi.hoisted(() => ({ requireFamily: vi.fn(), sb: vi.fn() }));
vi.mock("../lib/ingestion/auth", () => ({ authenticateFamily: state.requireFamily }));
vi.mock("../lib/supabase", () => ({ getServiceClient: state.sb }));
import { GET } from "../app/api/stories/[id]/route";
import { IngestionError } from "../lib/ingestion/http";


describe("private story media", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const request = new Request(`http://localhost/api/stories/${id}`);
  const context = { params: Promise.resolve({ id }) };
  beforeEach(() => vi.clearAllMocks());
  it("checks membership before accessing media", async () => {
    state.requireFamily.mockRejectedValue(new IngestionError(401, "Sign in"));
    expect((await GET(request, context)).status).toBe(401);
  });
  it("scopes the memory to the session family and returns no embeddings or internal paths", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: {
      id, transcript: "Hello.", media_path: "family/private.webm", embedding: [1, 2], audio_segments: [{ start: 0, end: 1, text: "Hello." }],
    }, error: null }) };
    const sign = vi.fn().mockResolvedValue({ data: { signedUrl: "https://example.invalid/signed" }, error: null });
    state.requireFamily.mockResolvedValue({ familyId: "family" });
    state.sb.mockReturnValue({ from: () => query, storage: { from: () => ({ createSignedUrl: sign }) } });
    const response = await GET(request, context);
    expect(query.eq.mock.calls).toEqual([["id", id], ["family_id", "family"]]);
    expect(await response.json()).toEqual({ id, transcript: "Hello.", mediaUrl: "https://example.invalid/signed", segments: [{ start: 0, end: 1, text: "Hello." }] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    query.maybeSingle.mockResolvedValue({ data: null, error: null } as never);
    expect((await GET(request, context)).status).toBe(404);
    expect(sign).toHaveBeenCalledTimes(1);
  });
  it("reads atomic source timings before the column migration", async () => {
    state.requireFamily.mockResolvedValue({ familyId: "family" });
    const segments = [{ start: 0, end: 1, text: "Hello." }];
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id, transcript: "Hello.", audio_segments: [], source: { audio_segments: segments } }, error: null }) };
    state.sb.mockReturnValue({ from: () => query });
    expect((await (await GET(request, context)).json()).segments).toEqual(segments);
  });
  it("loads legacy recordings without a timing column", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id, transcript: "Hello.", media_path: null }, error: null }) };
    state.requireFamily.mockResolvedValue({ familyId: "family" });
    state.sb.mockReturnValue({ from: () => query });
    expect(await (await GET(request, context)).json()).toEqual({ id, transcript: "Hello.", mediaUrl: null, segments: [] });
  });
});
