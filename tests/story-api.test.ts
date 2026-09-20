import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const state = vi.hoisted(() => ({ requireFamily: vi.fn() }));
vi.mock("../lib/auth/server", () => ({ requireFamily: state.requireFamily,
  AccessError: class extends Error { constructor(message: string, public status: number) { super(message); } } }));
import { GET } from "../app/api/stories/[id]/route";
import { AccessError } from "../lib/auth/server";
import { insertTimedMemory } from "../lib/audio-segments";

describe("private story media", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const request = new Request(`http://localhost/api/stories/${id}`);
  const context = { params: Promise.resolve({ id }) };
  beforeEach(() => vi.clearAllMocks());
  it("checks membership before accessing media", async () => {
    state.requireFamily.mockRejectedValue(new AccessError("Sign in", 401));
    expect((await GET(request, context)).status).toBe(401);
  });
  it("scopes the memory to the session family and returns no embeddings or internal paths", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: {
      id, transcript: "Hello.", media_path: "family/private.webm", embedding: [1, 2], audio_segments: [{ start: 0, end: 1, text: "Hello." }],
    }, error: null }) };
    const sign = vi.fn().mockResolvedValue({ data: { signedUrl: "https://example.invalid/signed" }, error: null });
    state.requireFamily.mockResolvedValue({ familyId: "family", sb: { from: () => query, storage: { from: () => ({ createSignedUrl: sign }) } } });
    const response = await GET(request, context);
    expect(query.eq.mock.calls).toEqual([["id", id], ["family_id", "family"]]);
    expect(await response.json()).toEqual({ id, transcript: "Hello.", mediaUrl: "https://example.invalid/signed", segments: [{ start: 0, end: 1, text: "Hello." }] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    query.maybeSingle.mockResolvedValue({ data: null, error: null } as never);
    expect((await GET(request, context)).status).toBe(404);
    expect(sign).toHaveBeenCalledTimes(1);
  });
  it("loads legacy recordings without a timing column", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id, transcript: "Hello.", media_path: null }, error: null }) };
    state.requireFamily.mockResolvedValue({ familyId: "family", sb: { from: () => query } });
    expect(await (await GET(request, context)).json()).toEqual({ id, transcript: "Hello.", mediaUrl: null, segments: [] });
  });
});

describe("timing migration compatibility", () => {
  it("retries only a rejected insert whose timing column is missing", async () => {
    const single = vi.fn().mockResolvedValueOnce({ data: null, error: { code: "PGRST204", message: "audio_segments column missing" } })
      .mockResolvedValueOnce({ data: { id: "saved" }, error: null });
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    const sb = { from: () => ({ insert }) } as unknown as SupabaseClient;
    expect((await insertTimedMemory(sb, { transcript: "Hello" }, [])).data.id).toBe("saved");
    expect(insert.mock.calls).toEqual([[{ transcript: "Hello", audio_segments: [] }], [{ transcript: "Hello" }]]);
    single.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });
    await insertTimedMemory(sb, { transcript: "Hello" }, []);
    expect(insert).toHaveBeenCalledTimes(3);
  });
});
