import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./memory-scene.css";

export const metadata: Metadata = {
  title: "Kin",
  description:
    "Family photos and stories. A familiar reminder when you need one.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
