import type { ZodType } from "zod";

export interface ChatJSONOptions<T> {
  name: string;
  jsonSchema: Record<string, unknown>;
  zodSchema: ZodType<T>;
  system: string;
  user: string;
  timeoutMs?: number;
  imageBase64?: { data: string; mimeType: string };
}
