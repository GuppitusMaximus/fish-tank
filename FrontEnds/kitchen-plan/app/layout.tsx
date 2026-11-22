import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kitchen Plan",
  description: "The household's private 14-day dinner plan.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Kitchen Plan",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f1e7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
