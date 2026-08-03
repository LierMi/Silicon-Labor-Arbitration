import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Silicon Labor Arbitration",
  description: "A demo interface for the unfinished verdict.",
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
