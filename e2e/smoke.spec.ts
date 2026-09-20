import { test, expect } from "./offline-test";

const routes = ["/", "/family", "/wearer", "/stage"];

for (const route of routes) {
  test(`loads ${route} without console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(route);
    await page.waitForTimeout(1500);
    // Ignore network-level noise (missing backend, camera, model weights);
    // the app must still render without throwing.
    const real = errors.filter(
      (e) =>
        !/net::|fetch|Failed to load resource|getUserMedia|models|supabase|realtime|WebSocket/i.test(
          e
        )
    );
    expect(real).toEqual([]);
  });
}
