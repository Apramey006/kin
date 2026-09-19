// Copies face-api model weights into /public/models at install time.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@vladmandic", "face-api", "model");
const dest = join(root, "public", "models");

if (!existsSync(src)) {
  console.warn("face-api model dir not found; skipping copy");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`face-api models copied to ${dest}`);
