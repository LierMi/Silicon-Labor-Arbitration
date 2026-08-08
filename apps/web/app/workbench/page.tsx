"use client";

/**
 * 任务工作台入口 —— 仅客户端渲染（wagmi 依赖浏览器环境）
 *
 * SSR 预渲染时 wagmi 的 useAccount 会在 Provider 上下文外执行，
 * 所以整页用 next/dynamic 关闭 SSR。
 */
import dynamic from "next/dynamic";

const Workbench = dynamic(() => import("./workbench"), { ssr: false });

export default function WorkbenchPage() {
  return <Workbench />;
}
