import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "*.spec.ts", timeout: 30000,
  use: { baseURL: "http://localhost:3197", serviceWorkers: "block" },
  webServer: { command: "node scripts/offline-check.mjs serve", url: "http://localhost:3197", reuseExistingServer: false, timeout: 120000 },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
