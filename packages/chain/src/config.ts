/**
 * 链与合约配置
 *
 * 地址来自 `deployments/monad-testnet.json`（已在链上核验：
 * 6021 字节运行时代码、sha256 一致、部署交易区块 49534792）。
 */

import { defineChain } from "viem";

export const MONAD_TESTNET_CHAIN_ID = 10_143;

export const monadTestnet = defineChain({
  id: MONAD_TESTNET_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" },
  },
  testnet: true,
});

/** TaskEscrow 部署地址 */
export const TASK_ESCROW_ADDRESS =
  "0x67040374b8A9756586De0885f01d1291cE8FFCcF" as const;
