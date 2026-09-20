import { test as base, expect } from "@playwright/test";

/** All browser specifications are fixtures-only. Page-specific mocks override
 * this context fallback; unmatched APIs and external connections are blocked. */
export const test = base.extend<{ backendGuard: void }>({
  backendGuard: [async ({ context, baseURL }, use) => {
    const origin = new URL(baseURL!).origin;
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || url.pathname.startsWith("/api/")) return route.abort();
      return route.continue();
    });
    await context.routeWebSocket("**/*", socket => socket.close());
    await use();
  }, { auto: true }],
});
export { expect };
export type { Page } from "@playwright/test";
