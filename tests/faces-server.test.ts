import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recognizeFace } from "../lib/faces-server";
import { detectFaces } from "../lib/server-faces";
import { IngestionError } from "../lib/ingestion/http";
vi.mock("../lib/server-faces", async original => ({
  ...await original<typeof import("../lib/server-faces")>(), detectFaces: vi.fn(),
}));
const sb = { from: vi.fn() } as unknown as SupabaseClient;
beforeEach(() => vi.clearAllMocks());
describe("server descriptor boundary after merge", () => {
  it.each([502, 503])("fails closed on service error %s without browser fallback", async status => {
    vi.mocked(detectFaces).mockRejectedValueOnce(new IngestionError(status, "service unavailable"));
    expect((await recognizeFace(sb, "670f5075-c286-4b29-8074-86401c18d0c0", Buffer.from("mock snapshot"), "image/jpeg")).status).toBe("unavailable");
    expect(sb.from).not.toHaveBeenCalled();
  });
  it("does not acquire identity from an empty server detection", async () => {
    vi.mocked(detectFaces).mockResolvedValueOnce([]);
    expect((await recognizeFace(sb, "670f5075-c286-4b29-8074-86401c18d0c0", Buffer.from("mock snapshot"), "image/jpeg")).status).toBe("no_face");
    expect(sb.from).not.toHaveBeenCalled();
  });
});
