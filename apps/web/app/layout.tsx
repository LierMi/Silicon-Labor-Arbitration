import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "./wallet-provider";

export const metadata: Metadata = {
  title: "硅基劳动仲裁院 · Silicon Labor Arbitration",
  description: "还原 Agent 委托中的责任时间线。AI 处理可测量的部分，人类保留最终控制权。",
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
