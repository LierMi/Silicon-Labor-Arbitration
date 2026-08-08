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
import { prepareCreateTask, buildE3, getE3Provenance } from "@sla/moss-bridge";
import { isAddress } from "viem";

const HEX_RE = /^0x[0-9a-fA-F]+$/;
const AMOUNT_RE = /^\d+(\.\d+)?$/;

/**
 * 签前解释（人话层）——与 E3.explanation 逐字一致。
 * 用户签名前看到的每一句都归档进证据，改这里就等于改证据。
 */
function buildExplanation(amountMon: string, deadline: number, requirements: unknown[]): string {
  const deadlineText = new Date(deadline * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const clauseLines = requirements.map((r, i) => {
    const label = (r as { label?: string }).label ?? `条款 ${i + 1}`;
    return `  ${i + 1}. ${label || `（未命名条款 ${i + 1}）`}`;
  }).join("\n");
  return (
    `你将把 ${amountMon} MON 锁入硅基劳动仲裁院托管合约（TaskEscrow）。` +
    `交付验收通过前资金不会释放；截止 ${deadlineText}（北京时间）前未交付可原路退款。` +
    `验收条款如下，权重在创建时随哈希承诺上链：\n${clauseLines}\n` +
    `若交付引发争议，规则引擎按事前承诺的验收条款复算，` +
    `客观部分自动分账，主观部分（如「画的是否为猫」）冻结并交人类复核。`
  );
}

export async function POST(request: Request) {
  let body: { account?: string; amountMon?: string; requirementsHash?: string; deadline?: string; requirements?: unknown[] };
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
    const e3 = await buildE3(
      prepared,
      buildExplanation(amountMon, deadlineNum, body.requirements ?? []),
      getE3Provenance(),
    );
    return NextResponse.json({ ...prepared, evidenceHash: e3.canonicalPayloadHash, e3 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
