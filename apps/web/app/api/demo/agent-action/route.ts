/**
 * 演示用 Agent 自动签名 API（仅本地演示）
 *
 * 解决演示痛点：指派 Agent 后「提交交付」必须由 Agent 钱包签名，
 * 手动导入私钥太麻烦。这里在服务端用 contracts/.env 的
 * DEPLOYER_PRIVATE_KEY 派生 Agent 私钥（deployer + offset，与 e2e-verify 同法），
 * 签名并广播，前端一键完成。
 *
 * ⚠️ 私钥只存在于服务端 .env，不进前端 bundle。
 * ⚠️ 仅限演示环境使用；生产环境必须由真实 Agent 钱包签名。
 *
 * POST /api/demo/agent-action
 *   body: { taskId, action: "submitDelivery" | "acceptDelivery", agentOffset }
 */
import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, encodeFunctionData, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { monadTestnet, TASK_ESCROW_ADDRESS, taskEscrowAbi } from "@sla/chain";

const RPC = "https://testnet-rpc.monad.xyz";

// 固定 Agent allowlist（与 workbench DEMO_AGENTS 的 offset 一致）：
// 外部请求者无法遍历任意偏移触发 deployer 资助，总支出被结构性限制在
// allowlist × 单次资助上限（5 × 0.05 MON = 0.25 MON）。
const ALLOWED_AGENT_OFFSETS = new Set([999, 1000, 1001, 1002, 1003]);

// ponytail: 进程内滑动窗口限流，单实例有效；多实例部署时近似（升级需共享存储）
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_HITS = 5;
const rateHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rateHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX_HITS) {
    rateHits.set(ip, hits);
    return true;
  }
  rateHits.set(ip, [...hits, now]);
  return false;
}

function loadDeployerKey(): `0x${string}` {
  // 优先读环境变量（Vercel 等托管环境在 dashboard 配置，不进代码）
  const fromEnv = process.env.DEPLOYER_PRIVATE_KEY;
  if (fromEnv?.startsWith("0x")) return fromEnv as `0x${string}`;
  // 本地开发 fallback：contracts/.env 文件（仓库根，apps/web 上溯两级）
  const envPath = resolve(process.cwd(), "..", "..", "contracts", ".env");
  const raw = readFileSync(envPath, "utf-8");
  const line = raw.split("\n").find((l) => l.startsWith("DEPLOYER_PRIVATE_KEY="));
  if (!line) throw new Error("缺 DEPLOYER_PRIVATE_KEY：请设置环境变量或 contracts/.env");
  return line.slice(line.indexOf("=") + 1).trim() as `0x${string}`;
}

export async function POST(request: Request) {
  // 演示开关：默认关闭；生产/部署环境必须显式 DEMO_AGENT_ACTION_ENABLED=true 才启用
  if (process.env.DEMO_AGENT_ACTION_ENABLED !== "true") {
    return NextResponse.json({ error: "演示自动签名未启用（需设置 DEMO_AGENT_ACTION_ENABLED=true）" }, { status: 403 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: { taskId?: string; action?: string; agentOffset?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }
  const { taskId, action, agentOffset } = body;
  if (!taskId?.startsWith("0x")) return NextResponse.json({ error: "taskId 必须 0x 开头" }, { status: 400 });
  if (action !== "submitDelivery" && action !== "acceptDelivery") {
    return NextResponse.json({ error: "action 必须是 submitDelivery 或 acceptDelivery" }, { status: 400 });
  }
  if (agentOffset === undefined || !Number.isInteger(agentOffset) || agentOffset < 0) {
    return NextResponse.json({ error: "agentOffset 必须是 >= 0 的整数" }, { status: 400 });
  }
  if (!ALLOWED_AGENT_OFFSETS.has(agentOffset)) {
    return NextResponse.json(
      { error: `agentOffset 不在允许列表内（${[...ALLOWED_AGENT_OFFSETS].sort((a, b) => a - b).join(", ")}）` },
      { status: 403 },
    );
  }
  const offset: number = agentOffset;

  try {
    const deployerKey = loadDeployerKey();
    const agentKey = `0x${(BigInt(deployerKey) + BigInt(offset)).toString(16).padStart(64, "0")}` as `0x${string}`;
    const account = privateKeyToAccount(agentKey);
    const deployerAccount = privateKeyToAccount(deployerKey);
    const client = createWalletClient({ account: deployerAccount, chain: monadTestnet as never, transport: http(RPC) });
    const agentClient = createWalletClient({ account, chain: monadTestnet as never, transport: http(RPC) });

    // 确保 agent 有 gas：余额 < 0.02 MON 时用 deployer 转 0.05 MON
    const publicClient = createPublicClient({ chain: monadTestnet as never, transport: http(RPC) });
    const bal = await publicClient.getBalance({ address: account.address });
    if (bal < 20_000_000_000_000_000n) {
      await (client as never as { sendTransaction: (p: { to: string; value: bigint; type: string }) => Promise<`0x${string}`> }).sendTransaction({
        to: account.address,
        value: 50_000_000_000_000_000n,
        type: "legacy",
      });
    }

    const txRequest =
      action === "submitDelivery"
        ? {
            functionName: "submitDelivery" as const,
            args: [taskId as `0x${string}`, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`],
          }
        : { functionName: "acceptDelivery" as const, args: [taskId as `0x${string}`] };

    const data = encodeFunctionData({
      abi: taskEscrowAbi,
      functionName: txRequest.functionName,
      args: txRequest.args as never,
    });

    // 强制 legacy (type-0) 交易：Monad RPC 对 EIP-1559 type-2 交易
    // 返回 "Signer had insufficient balance"（字段解析问题），cast --legacy 已验证可发
    const hash = await (agentClient as never as { sendTransaction: (p: { to: string; data: string; type: string }) => Promise<`0x${string}`> }).sendTransaction({
      to: TASK_ESCROW_ADDRESS,
      data,
      type: "legacy",
    });
    return NextResponse.json({ txHash: hash, signer: account.address, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
