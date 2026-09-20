import { copyFile, readdir, access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

// tfjs-node's source-build installer can place the DLL under the host N-API
// version while compiling the addon for napi-v8. Keep the vendor DLL beside
// every actual addon so Windows' loader can resolve it on Node 20–22.
if (process.platform === "win32") {
  const require = createRequire(import.meta.url);
  const root = path.dirname(require.resolve("@tensorflow/tfjs-node/package.json"));
  const library = path.join(root, "deps", "lib", "tensorflow.dll");
  await access(library);
  for (const entry of await readdir(path.join(root, "lib"), { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^napi-v\d+$/.test(entry.name)) continue;
    const directory = path.join(root, "lib", entry.name);
    try { await access(path.join(directory, "tfjs_binding.node")); } catch { continue; }
    await copyFile(library, path.join(directory, "tensorflow.dll"));
  }
}
