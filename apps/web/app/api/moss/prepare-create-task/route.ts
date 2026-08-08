/**
 * Moss 桥 —— createTask 的 P0 主路径（服务端）
 *
 * AGENTS.md 铁律：Moss 是核心依赖，浏览器不得直接依赖 Moss monorepo。
 * 这里把 `prepareCreateTask` 包成 HTTP 端点，前端只拿 unsigned tx + E3 证据，
 * 钱包是唯一签名与广播边界。
 *
 * POST /api/moss/prepare-create-task
 *   body: { account, amountMon, requirementsHash, deadline }
 *   → PreparedTask（unsignedTransaction / estimatedGas / warnings / evidenceHash / …）
 */
import { NextResponse } from "next/server";
import { prepareCreateTask } from "@sla/moss-bridge";
import { isAddress } from "viem";

const HEX_RE = /^0x[0-9a-fA-F]+$/;
const AMOUNT_RE = /^\d+(\.\d+)?$/;

export async function POST(request: Request) {
  let body: { account?: string; amountMon?: string; requirementsHash?: string; deadline?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const { account, amountMon, requirementsHash, deadline } = body;
  if (!account || !isAddress(account)) {
    return NextResponse.json({ error: "account 必须是合法钱包地址" }, { status: 400 });
  }
  if (!amountMon || !AMOUNT_RE.test(amountMon) || Number(amountMon) <= 0) {
    return NextResponse.json({ error: "amountMon 必须是正数，如 \"0.2\"" }, { status: 400 });
  }
  if (!requirementsHash || !HEX_RE.test(requirementsHash) || requirementsHash.length !== 66) {
    return NextResponse.json({ error: "requirementsHash 必须是 32 字节十六进制 0x…" }, { status: 400 });
  }
  const deadlineNum = Number(deadline);
  if (!deadline || !Number.isInteger(deadlineNum) || deadlineNum <= Math.floor(Date.now() / 1000)) {
    return NextResponse.json({ error: "deadline 必须是未来 Unix 秒" }, { status: 400 });
  }

  try {
    const prepared = await prepareCreateTask(account, amountMon, requirementsHash, deadline);
    return NextResponse.json(prepared);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
