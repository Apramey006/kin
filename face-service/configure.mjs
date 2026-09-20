import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const target = new URL("../.env.local", import.meta.url);
let content;
try { content = await readFile(target, "utf8"); }
catch (error) { if (error.code !== "ENOENT") throw error; content = ""; }
const newline = content.includes("\r\n") ? "\r\n" : "\n";
let changed = 0;
for (const [name, create] of [
  ["KIN_FACE_SERVICE_URL", () => "http://127.0.0.1:8100/detect"],
  ["KIN_FACE_SERVICE_TOKEN", () => randomBytes(32).toString("hex")],
  ["KIN_FACE_TOKEN_KEY", () => randomBytes(32).toString("hex")],
]) {
  const expression = new RegExp(`^${name}[ \\t]*=[ \\t]*(.*)$`, "m");
  const found = content.match(expression);
  const value = found?.[1].replace(/\r$/, "").trim();
  if (value && value !== '""' && value !== "''" && !value.startsWith("#")) continue;
  const line = `${name}=${create()}`;
  content = found ? content.replace(expression, `${line}${found[1].endsWith("\r") ? "\r" : ""}`)
    : `${content}${content && !content.endsWith("\n") ? newline : ""}${line}${newline}`;
  changed++;
}
if (changed) await writeFile(target, content, { mode: 0o600 });
console.log(`Local face configuration ready (${changed} missing settings initialized; values withheld).`);
