import OpenAI from "openai";
import type { ZodType } from "zod";
import { withTimeout } from "../util";
import { CONFIG } from "../config";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

export const chatModel = () => process.env.OPENAI_MODEL || "gpt-4o";
export const embedModel = () =>
  process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

export async function embedText(text: string): Promise<number[]> {
  const res = await getClient().embeddings.create({
    model: embedModel(),
    input: text,
  });
  return res.data[0].embedding;
}

interface ChatJSONOptions<T> {
  name: string;
  jsonSchema: Record<string, unknown>;
  zodSchema: ZodType<T>;
  system: string;
  user: string;
  timeoutMs?: number;
  imageBase64?: { data: string; mimeType: string };
}

/**
 * Chat completion with a strict JSON schema response, validated by zod.
 * Retries once on parse/validation failure, then throws.
 */
export async function chatJSON<T>(opts: ChatJSONOptions<T>): Promise<T> {
  const timeout = opts.timeoutMs ?? CONFIG.timeouts.extractionMs;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const userContent: OpenAI.ChatCompletionContentPart[] = [
        { type: "text", text: opts.user },
      ];
      if (opts.imageBase64) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${opts.imageBase64.mimeType};base64,${opts.imageBase64.data}`,
          },
        });
      }
      const res = await withTimeout(
        getClient().chat.completions.create({
          model: chatModel(),
          temperature: 0.2,
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: userContent },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: opts.name,
              schema: opts.jsonSchema,
              strict: true,
            },
          },
        }),
        timeout,
        opts.name
      );
      const content = res.choices[0]?.message?.content ?? "";
      return opts.zodSchema.parse(JSON.parse(content));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const captionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["caption", "objects", "setting"],
  properties: {
    caption: { type: "string" },
    objects: { type: "array", items: { type: "string" } },
    setting: { type: "string" },
  },
} as const;

export interface SceneCaption {
  caption: string;
  objects: string[];
  setting: string;
}

/** Describe a photo. Never identifies people. */
export async function captionImage(
  image: Buffer,
  mimeType = "image/jpeg"
): Promise<SceneCaption> {
  const { z } = await import("zod");
  const zodSchema = z.object({
    caption: z.string(),
    objects: z.array(z.string()),
    setting: z.string(),
  });
  return chatJSON<SceneCaption>({
    name: "scene_caption",
    jsonSchema: captionSchema,
    zodSchema,
    system:
      "You describe photos for a family memory app. Describe only what is visible: clothing, objects, setting, actions. Never identify or name people. Never guess who someone is.",
    user: "Describe this photo in one caption sentence, list visible objects, and name the setting.",
    timeoutMs: CONFIG.timeouts.visionMs,
    imageBase64: { data: image.toString("base64"), mimeType },
  });
}
