"use client";

/**
 * 案件数据源 adapter —— mock / live 双模式
 *
 * - mock（默认）：freshPotatoCase() 固化演示数据，isMock=true，UI 必须显著标注。
 * - live：通过 viem 读 Monad Testnet TaskEscrow 真实任务，
 *   用链上真实字段覆盖 mock 骨架（status / client / amount / deadline /
 *   requirementsHash / taskId / confirmed），isMock=false。
 *
 * 切换方式（构建时注入，避免运行时不确定）：
 *   NEXT_PUBLIC_CASE_SOURCE=mock   （默认）
 *   NEXT_PUBLIC_CASE_SOURCE=live
 *   NEXT_PUBLIC_LIVE_TASK_ID=0x…   （live 模式下要读的任务，缺省取最新 TaskCreated）
 *
 * 失败策略：live 读取失败时回退到 mock 骨架并保留 isMock=true，
 * 不允许把假数据伪装成真数据（AGENTS.md 不变量 5）。
 */

import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  http,
  formatEther,
  isAddress,
  parseAbiItem,
} from "viem";
import {
  monadTestnet,
  TASK_ESCROW_ADDRESS,
  taskEscrowAbi,
  decodeContractStatus,
  toCaseStatus,
} from "@sla/chain";
import { freshPotatoCase } from "@sla/domain";
import type { Case } from "@sla/domain";
import { buildArchiveSummary, buildEvidenceConnectionIndex } from "./case-presentation";

export type CaseSource = "mock" | "live";

export function getCaseSource(): CaseSource {
  return process.env.NEXT_PUBLIC_CASE_SOURCE === "live" ? "live" : "mock";
}

export function getLiveTaskId(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_LIVE_TASK_ID;
  return raw?.startsWith("0x") ? raw : undefined;
}

function deadlineToIso(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toISOString();
}

const TASK_CREATED_EVENT = parseAbiItem(
  "event TaskCreated(bytes32 indexed taskId, address indexed client, uint256 amount, bytes32 reqHash, uint256 deadline)",
);

/** 从 latest 往回并行分块查 TaskCreated（RPC 限制单次 100 块），返回最近一条。 */
type PublicClientLike = {
  getBlockNumber(): Promise<bigint>;
  getLogs(args: {
    address: string;
    event: typeof TASK_CREATED_EVENT;
    fromBlock: bigint;
    toBlock: bigint | "latest";
  }): Promise<Array<{ args: { taskId?: unknown } }>>;
};

async function findLatestTaskCreated(client: PublicClientLike) {
  // ponytail: 默认只扫最近 20_000 块（并行，快）；旧任务用 NEXT_PUBLIC_LIVE_TASK_ID 显式指定
  const SCAN_BLOCKS = 20_000n;
  const step = 100n;
  const latest = await client.getBlockNumber();
  const start = latest - SCAN_BLOCKS > 0n ? latest - SCAN_BLOCKS : 0n;
  const windows: Array<{ from: bigint; to: bigint }> = [];
  for (let to = latest; to > start; to -= step) {
    const from = to - step + 1n;
    windows.push({ from: from > start ? from : start, to });
  }
  // 从最新窗口往回并行扫（最新优先，找到即停）
  const BATCH = 20;
  for (let i = 0; i < windows.length; i += BATCH) {
    const results = await Promise.allSettled(
      windows.slice(i, i + BATCH).map(({ from, to }) =>
        client.getLogs({ address: TASK_ESCROW_ADDRESS, event: TASK_CREATED_EVENT, fromBlock: from, toBlock: to }),
      ),
    );
    for (let j = results.length - 1; j >= 0; j--) {
      const r = results[j];
      if (r.status === "fulfilled" && r.value.length > 0) {
        const taskId = r.value.at(-1)!.args.taskId;
        if (taskId) return taskId as `0x${string}`;
      }
    }
  }
  throw new Error(`live: no TaskCreated in last ${SCAN_BLOCKS} blocks (set NEXT_PUBLIC_LIVE_TASK_ID for older tasks)`);
}

/** 从链上读真实任务，覆盖 mock 骨架。任何一步失败都抛错 → 上层回退 mock。 */
async function loadLiveCase(): Promise<Case> {
  const client = createPublicClient({
    chain: monadTestnet as never,
    transport: http(monadTestnet.rpcUrls.default.http[0]),
  });

  // 1. 定位 taskId：显式指定，否则取链上最近一条 TaskCreated 事件
  let taskId = getLiveTaskId() as `0x${string}` | undefined;
  if (!taskId) {
    taskId = await findLatestTaskCreated(client as unknown as PublicClientLike);
  }
  // 2. 读链上状态（uint8 → ContractTaskStatus → CaseStatus）
  const rawStatus = await client.readContract({
    address: TASK_ESCROW_ADDRESS,
    abi: taskEscrowAbi,
    functionName: "getTaskStatus",
    args: [taskId],
  });
  const contractStatus = decodeContractStatus(Number(rawStatus));
  if (!contractStatus) throw new Error(`live: unknown task status ${rawStatus}`);
  const mapped = toCaseStatus(contractStatus);
  if (!mapped) throw new Error(`live: status ${contractStatus} has no domain mapping`);

  // 3. 读任务详情（tasks mapping 是 public，ABI 里叫 tasks）
  const task = await client.readContract({
    address: TASK_ESCROW_ADDRESS,
    abi: taskEscrowAbi,
    functionName: "tasks",
    args: [taskId],
  });
  const [taskClient, taskAgent, taskAmount, taskReqHash, taskDeliveryHash, taskCaseId, taskDeadline] = task as unknown as [
    `0x${string}`, `0x${string}`, bigint, `0x${string}`, `0x${string}`, `0x${string}`, bigint,
  ];

  const base = freshPotatoCase();
  return {
    ...base,
    isMock: false,
    status: mapped,
    client: isAddress(taskClient) ? taskClient : base.client,
    agent: taskAgent && taskAgent !== "0x0000000000000000000000000000000000000000" ? taskAgent : base.agent,
    onchain: {
      ...base.onchain,
      taskId,
      chainId: monadTestnet.id,
      taskEscrowAddress: TASK_ESCROW_ADDRESS,
      amount: formatEther(taskAmount),
      deadline: deadlineToIso(taskDeadline),
      requirementsHash: taskReqHash,
      deliveryHash: taskDeliveryHash,
      confirmed: true,
      caseId: taskCaseId !== "0x0000000000000000000000000000000000000000000000000000000000000000" ? taskCaseId : undefined,
    },
  };
}

/**
 * 页面数据入口。mock 同步返回；live 异步拉取，加载中先给 mock 骨架，
 * 成功后替换为真实数据。live 失败 → 保留 mock 并标 isMock=true。
 */
export function useCase() {
  const source = getCaseSource();
  const [caseFile, setCaseFile] = useState<Case>(() => freshPotatoCase());

  useEffect(() => {
    if (source !== "live") return;
    let cancelled = false;
    loadLiveCase()
      .then((live) => {
        if (!cancelled) setCaseFile(live);
      })
      .catch((err) => {
        // ponytail: 失败保留 mock 骨架，诚实标注，不做真实数据伪装
        console.error("[case-source] live load failed, fallback to mock:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const connections = useMemo(() => buildEvidenceConnectionIndex(caseFile), [caseFile]);
  const summary = useMemo(() => buildArchiveSummary(caseFile), [caseFile]);

  return { caseFile, source, connections, summary };
}
