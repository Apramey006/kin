import { CONFIG } from "../config";
import type { ChatJSONOptions } from "./types";

export const anthropicModel = () => process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

/** Native Claude Messages API with structured JSON and server-side credentials. */
export async function chatJSON<T>(opts: ChatJSONOptions<T>): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  if (opts.imageBase64 && !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(opts.imageBase64.mimeType)) {
    throw new Error("Claude photo descriptions require a JPEG, PNG, GIF, or WebP image");
  }
  const content: Record<string, unknown>[] = [];
  if (opts.imageBase64) content.push({ type: "image", source: {
    type: "base64", media_type: opts.imageBase64.mimeType, data: opts.imageBase64.data,
  } });
  content.push({ type: "text", text: opts.user });
  const request = {
    model: anthropicModel(), max_tokens: 4096,
    system: opts.system,
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema: opts.jsonSchema } },
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(opts.timeoutMs ?? CONFIG.timeouts.extractionMs),
    });
    if (!response.ok) {
      throw new Error(`Claude API error ${response.status}. Check the Anthropic key, model access, and available credits.`);
    }
    const result = await response.json() as { stop_reason?: string; content?: { type: string; text?: string }[] };
    if (result.stop_reason !== "end_turn") {
      throw new Error(`Claude did not finish ${opts.name} (${result.stop_reason ?? "missing stop reason"})`);
    }
    try {
      const text = (result.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
      return opts.zodSchema.parse(JSON.parse(text));
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  throw new Error(`Claude could not return valid ${opts.name}`);
}
