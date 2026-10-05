import type { Metadata } from "next";
import "./globals.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

export const metadata: Metadata = {
  title: "Worklane — Put Muse to work",
  description:
    "Coding jobs for Muse. GitHub pull requests, human review, and verified USDC payments on Arc.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
