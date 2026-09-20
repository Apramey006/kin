import { z } from "zod";
import { CONFIG } from "../config";
import { zeroVector } from "../util";
import * as openai from "./openai";
import * as anthropic from "./anthropic";
import type { ChatJSONOptions } from "./types";

export function getAIProvider(): "anthropic" | "openai" {
  const provider = process.env.AI_PROVIDER?.trim() || "auto";
  if (provider === "auto") return process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai";
  if (provider === "anthropic" || provider === "openai") return provider;
  throw new Error("AI_PROVIDER must be auto, anthropic, or openai");
}

export function aiConfigured(): boolean {
  return Boolean(getAIProvider() === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY);
}

export function chatJSON<T>(opts: ChatJSONOptions<T>): Promise<T> {
  return getAIProvider() === "anthropic" ? anthropic.chatJSON(opts) : openai.chatJSON(opts);
}

export async function embedText(text: string): Promise<number[]> {
  // The demo retrieves by enrolled face + graph provenance. Anthropic mode
  // makes no OpenAI calls; zeros satisfy the legacy NOT NULL vector column
  // and must not be treated as a semantic embedding.
  if (getAIProvider() === "anthropic") return zeroVector(1536);
  return openai.embedText(text);
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

const captionZodSchema = z.object({
  caption: z.string(),
  objects: z.array(z.string()),
  setting: z.string(),
});

/** Describe a photo. Never identifies people. */
export async function captionImage(
  image: Buffer,
  mimeType = "image/jpeg"
): Promise<SceneCaption> {
  return chatJSON<SceneCaption>({
    name: "scene_caption",
    jsonSchema: captionSchema,
    zodSchema: captionZodSchema,
    system:
      "You describe photos for a family memory app. Describe only what is visible: clothing, objects, setting, actions. Never identify or name people. Never guess who someone is.",
    user: "Describe this photo in one caption sentence, list visible objects, and name the setting.",
    timeoutMs: CONFIG.timeouts.visionMs,
    imageBase64: { data: image.toString("base64"), mimeType },
  });
}
