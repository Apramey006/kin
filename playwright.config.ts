import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
