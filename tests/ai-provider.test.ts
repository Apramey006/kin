import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { aiConfigured, captionImage, chatJSON, embedText, getAIProvider } from "../lib/providers/ai";

const opts = {
  name: "memory_extraction", system: "Extract only stated facts.", user: "Nora baked cake.",
  jsonSchema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false },
  zodSchema: z.object({ summary: z.string() }),
};
const reply = (value: unknown, stop = "end_turn") => new Response(JSON.stringify({
  stop_reason: stop, content: [{ type: "text", text: JSON.stringify(value) }],
}), { status: 200 });

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "auto");
  vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test-key");
  vi.stubEnv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001");
  vi.stubEnv("OPENAI_API_KEY", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("AI provider selection", () => {
  it("uses Anthropic without an OpenAI key", () => {
    expect(getAIProvider()).toBe("anthropic");
    expect(aiConfigured()).toBe(true);
  });
  it("preserves OpenAI for existing installations and respects explicit selection", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    expect(getAIProvider()).toBe("openai");
    expect(aiConfigured()).toBe(true);
    vi.stubEnv("AI_PROVIDER", "anthropic");
    expect(aiConfigured()).toBe(false);
  });
  it("rejects invalid provider names instead of silently spending elsewhere", () => {
    vi.stubEnv("AI_PROVIDER", "typo");
    expect(getAIProvider).toThrow("AI_PROVIDER");
  });
  it("does not contact OpenAI for embeddings in Anthropic mode, even if both keys exist", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await embedText("Nora baked cake.")).toEqual(Array(1536).fill(0));
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Claude adapter", () => {
  it("sends the schema and system instruction to the native Messages API", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply({ summary: "Nora baked cake." }));
    vi.stubGlobal("fetch", fetcher);
    expect(await chatJSON(opts)).toEqual({ summary: "Nora baked cake." });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("anthropic-test-key");
    const body = JSON.parse(init.body);
    expect(body.system).toBe(opts.system);
    expect(body.output_config.format.schema).toEqual(opts.jsonSchema);
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("sends a photo as a base64 image block and validates its caption", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply({ caption: "A yellow apron", objects: ["apron"], setting: "kitchen" }));
    vi.stubGlobal("fetch", fetcher);
    const image = Buffer.from("image-fixture");
    expect((await captionImage(image, "image/png")).objects).toEqual(["apron"]);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.messages[0].content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: image.toString("base64") } });
  });
  it("retries malformed structured output once", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply({ summary: 12 })).mockResolvedValueOnce(reply({ summary: "Nora baked cake." }));
    vi.stubGlobal("fetch", fetcher);
    await expect(chatJSON(opts)).resolves.toEqual({ summary: "Nora baked cake." });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects truncation instead of using incomplete facts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ summary: "Partial" }, "max_tokens")));
    await expect(chatJSON(opts)).rejects.toThrow("did not finish");
  });
  it("does not retry authentication errors or expose the key in the error", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("invalid", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(chatJSON(opts)).rejects.toThrow("Claude API error 401");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("refuses unsupported image formats before making a request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(captionImage(Buffer.from("fixture"), "image/heic")).rejects.toThrow("JPEG");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
