"use client";

/**
 * wagmi 钱包 Provider（Monad Testnet + TaskEscrow）
 *
 * 浏览器只做签名边界：createTask 的 unsigned tx 由服务端 Moss 桥准备，
 * 后续写操作（assign/submit/accept/…）走 chain 包的 direct hooks。
 */
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defineChain } from "viem";
import { MONAD_TESTNET_CHAIN_ID, TASK_ESCROW_ADDRESS } from "@sla/chain";
import { useState } from "react";
import type { ReactNode } from "react";

// 与 @sla/chain 的 monadTestnet 同参数，但在此文件内用本地 viem 实例定义，
// 避免 workspace 间 viem 泛型解析差异导致 createConfig 类型冲突。
const monadTestnet = defineChain({
  id: MONAD_TESTNET_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  testnet: true,
});

export const wagmiConfig = createConfig({
  ssr: true,
  chains: [monadTestnet],
  connectors: [injected()],
  transports: {
    [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0]),
  },
});

export { TASK_ESCROW_ADDRESS };

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
