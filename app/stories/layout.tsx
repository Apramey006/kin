import type { Viewport } from "next";
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export default function StoriesLayout({ children }: { children: React.ReactNode }) { return children; }
