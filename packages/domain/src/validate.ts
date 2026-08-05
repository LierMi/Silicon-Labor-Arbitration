/**
 * 案件数据一致性校验（黑客松分级版）
 *
 * 分级原则不是"工程是否严谨"，而是**会不会毁掉 Demo**：
 *
 *   P0  砸掉核心主张或当场穿帮 —— 必须修
 *   P1  台上会出现明显破绽     —— 必须修
 *   P2  洁癖 / 边界情况         —— 黑客松阶段放宽，只提示，不拦
 *
 * `assertValidCase` 只对 P0/P1 抛错。P2 用 `listP2` 自己看。
 */

import type { Case } from "./case.js";
import { TOTAL_WEIGHT_BPS } from "./case.js";
import { computeRequirementsHash } from "./canonical.js";
import { CASE_STATUSES } from "./status.js";

export type Severity = "P0" | "P1" | "P2";

export interface ValidationIssue {
  level: Severity;
  code: string;
  message: string;
}

/** 占位符：Gate 3 / Gate 4 之前允许存在，不计入任何级别 */
export const PENDING = "PENDING";
const isPending = (v: unknown) => v === PENDING;

export function validateCase(c: Case): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const at = (level: Severity, code: string, message: string) =>
    issues.push({ level, code, message });

  const evidenceIds = new Set(c.evidence.map((e) => e.id));
  const requirementIds = new Set(c.requirements.map((r) => r.id));

  // ────────────────────────────────────────────────
  // P0：砸掉核心主张，或评委当场能戳穿
  // ────────────────────────────────────────────────

  // 主观条款被判了 —— 直接毁掉 C4 高潮和整个立意
  for (const r of c.requirements) {
    const result = c.ruleResults.find((x) => x.id === r.id);
    if (r.type === "subjective" && result && result.verdict !== "undecidable") {
      at(
        "P0",
        "SUBJECTIVE_DECIDED",
        `主观条款 ${r.id} 被判成 ${result.verdict} —— 主观条款必须保持 undecidable，这是产品立场`,
      );
    }
  }

  // AI 意见没有引用证据 —— 违背我们对评委的核心承诺
  for (const a of c.aiArguments) {
    if (a.cites.length === 0) {
      at("P0", "AI_NO_CITES", `${a.role} 意见没有引用任何证据 —— 引用为空必须被拒绝`);
    }
  }

  // Direct 路径证据冒充 Moss —— 路演口径造假
  for (const e of c.evidence) {
    if (e.kind === "direct_tx" && e.source === "moss") {
      at("P0", "DIRECT_FAKED_AS_MOSS", `${e.id} 是 Direct 路径交易，不得标成 Moss 来源`);
    }
  }

  // 权重必须齐全且总和为 10000 —— 否则"金额可复算"这一主张不成立
  const missingWeight = c.requirements.filter((r) => typeof r.weightBps !== "number");
  if (missingWeight.length > 0) {
    at(
      "P0",
      "WEIGHT_MISSING",
      `条款缺少 weightBps：${missingWeight.map((r) => r.id).join(", ")} —— 金额将失去来源`,
    );
  } else {
    const sumBps = c.requirements.reduce((a, r) => a + r.weightBps, 0);
    if (sumBps !== TOTAL_WEIGHT_BPS) {
      at("P0", "WEIGHT_SUM", `权重之和为 ${sumBps} bps，必须等于 ${TOTAL_WEIGHT_BPS}`);
    }
  }

  // essential 必须显式声明 —— 它和 weightBps 一样要进 requirementsHash，
  // 静默默认值会让"承诺了什么"取决于代码版本
  const missingEssential = c.requirements.filter((r) => typeof r.essential !== "boolean");
  if (missingEssential.length > 0) {
    at(
      "P0",
      "ESSENTIAL_MISSING",
      `条款缺少 essential 标注：${missingEssential.map((r) => r.id).join(", ")} —— 无法判断给付是否可分`,
    );
  }

  // requirementsHash 必须与条款本身对得上。
  //
  // 这是"0.05 可复算"这一主张的技术支点：条款在争议之前被承诺上链，
  // 事后改不动。如果链上那个哈希跟手里的条款算不出同一个值，
  // 要么条款被改过，要么哈希是编的——两种都让整套叙事失效。
  if (c.onchain.requirementsHash !== undefined && !isPending(c.onchain.requirementsHash)) {
    try {
      const expected = computeRequirementsHash(c.requirements);
      if (c.onchain.requirementsHash.toLowerCase() !== expected.toLowerCase()) {
        at(
          "P0",
          "REQUIREMENTS_HASH_MISMATCH",
          `链上 requirementsHash 与条款算出的不一致：链上 ${c.onchain.requirementsHash}，实算 ${expected}`,
        );
      }
    } catch (e) {
      at("P0", "REQUIREMENTS_HASH_UNCOMPUTABLE", `条款无法规范化：${(e as Error).message}`);
    }
  }

  const hasUndecided = c.ruleResults.some((r) => r.verdict === "undecidable");
  const s = c.settlementProposal;

  // 核心条款判不了却仍按权重付了钱 —— 等于替人做了"附属条款值多少"的判断，
  // 与"判不了就不判"的立场直接冲突
  const essentialUndecided = c.requirements.filter(
    (r) => r.essential && c.ruleResults.find((x) => x.id === r.id)?.verdict === "undecidable",
  );
  if (essentialUndecided.length > 0 && s && Number(s.toAgent) > 0) {
    at(
      "P0",
      "ESSENTIAL_UNDECIDED_BUT_PAID",
      `核心条款 ${essentialUndecided.map((r) => r.id).join(", ")} 不可裁决，却仍向 Agent 支付了 ${s.toAgent} —— 核心条款判不了时必须全额冻结`,
    );
  }

  if (s) {
    const frozen = Number(s.frozen);
    // 有不可裁决却不冻结 —— 立场自相矛盾
    if (hasUndecided && !(frozen > 0)) {
      at(
        "P0",
        "NO_FROZEN_FOR_UNDECIDABLE",
        "存在不可裁决条款但冻结金额为 0 —— 不可裁决的部分必须冻结等待人类终审",
      );
    }
    // 钱对不平 —— 评委心算一下就露馅
    if (c.onchain.amount !== undefined && !isPending(c.onchain.amount)) {
      const total = Number(s.toAgent) + Number(s.toClient) + frozen;
      if (Math.abs(total - Number(c.onchain.amount)) > 1e-9) {
        at("P0", "SETTLEMENT_SUM", `结算总额 ${total} 与托管金额 ${c.onchain.amount} 不一致`);
      }
    }
  }

  // ────────────────────────────────────────────────
  // P1：台上会出现明显破绽
  // ────────────────────────────────────────────────

  // 条款没有判定 —— 裁决页少一行
  for (const r of c.requirements) {
    if (!c.ruleResults.some((x) => x.id === r.id)) {
      at("P1", "RULE_MISSING", `条款 ${r.id} 缺少判定结果`);
    }
  }

  for (const result of c.ruleResults) {
    // 不可裁决没写原因 —— UI 空章位旁边没字可显示
    if (result.verdict === "undecidable" && !result.reason) {
      at("P1", "UNDECIDABLE_NO_REASON", `${result.id} 判为 undecidable 但没写明原因`);
    }
    // 引用了不存在的证据 —— 点击角标会空
    for (const b of result.basis) {
      if (!evidenceIds.has(b)) {
        at("P1", "RULE_BASIS_UNKNOWN", `${result.id} 引用了不存在的证据 ${b}`);
      }
    }
  }

  for (const a of c.aiArguments) {
    for (const cite of a.cites) {
      if (!evidenceIds.has(cite)) {
        at("P1", "AI_CITE_UNKNOWN", `${a.role} 引用了不存在的证据 ${cite}`);
      }
    }
  }

  // E3 只有一句话没有结构 —— 我们刚在文档里强调过它不是一段文本
  for (const e of c.evidence) {
    if (e.kind === "moss_pre_sign_explanation" && !e.mossPreSign) {
      at("P1", "E3_EMPTY", `${e.id} 缺少结构化的 mossPreSign —— E3 不能只是一段文本`);
    }
  }

  // ────────────────────────────────────────────────
  // P2：黑客松阶段放宽，只提示
  // ────────────────────────────────────────────────

  if (!CASE_STATUSES.includes(c.status)) {
    at("P2", "STATUS_UNKNOWN", `未知状态 ${c.status}`);
  }

  for (const r of c.requirements) {
    const result = c.ruleResults.find((x) => x.id === r.id);
    if (r.type === "objective" && result?.verdict === "undecidable") {
      at("P2", "OBJECTIVE_UNDECIDED", `客观条款 ${r.id} 判成 undecidable，确认是否缺证据`);
    }
  }

  for (const result of c.ruleResults) {
    if (!requirementIds.has(result.id)) {
      at("P2", "RULE_ORPHAN", `判定结果 ${result.id} 找不到对应条款`);
    }
  }

  for (const a of c.aiArguments) {
    for (const u of a.uncertain) {
      if (!requirementIds.has(u)) {
        at("P2", "AI_UNCERTAIN_UNKNOWN", `${a.role} 标注了不存在的条款 ${u}`);
      }
    }
  }

  for (const e of c.evidence) {
    if (e.kind === "moss_pre_sign_explanation" && e.source !== "moss") {
      at("P2", "E3_SOURCE", `${e.id} 是 Moss 签前证据，来源建议标成 moss`);
    }
  }

  if (s && !hasUndecided && Number(s.frozen) > 0) {
    at("P2", "FROZEN_WITHOUT_UNDECIDABLE", "没有不可裁决条款却冻结了资金，确认原因");
  }
  if (!s && c.status === "Settled") {
    at("P2", "SETTLED_NO_PROPOSAL", "状态为已结算但没有结算方案");
  }

  for (const hop of c.responsibilityChain) {
    for (const ref of hop.evidenceRefs) {
      if (!evidenceIds.has(ref)) {
        at("P2", "HOP_EVIDENCE_UNKNOWN", `责任链 ${hop.id} 引用了不存在的证据 ${ref}`);
      }
    }
  }

  return issues;
}

/** 必须修的（P0 + P1） */
export function listBlocking(c: Case): ValidationIssue[] {
  return validateCase(c).filter((i) => i.level !== "P2");
}

/** 只是提醒的（P2），黑客松阶段不拦 */
export function listP2(c: Case): ValidationIssue[] {
  return validateCase(c).filter((i) => i.level === "P2");
}

/** 只对 P0/P1 抛错。P2 不阻塞开发。 */
export function assertValidCase(c: Case): void {
  const blocking = listBlocking(c);
  if (blocking.length > 0) {
    throw new Error(
      `案件 ${c.caseNo} 校验失败：\n` +
        blocking.map((e) => `  [${e.level} ${e.code}] ${e.message}`).join("\n"),
    );
  }
}

export function formatIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "✅ 无问题";
  return issues.map((i) => `[${i.level} ${i.code}] ${i.message}`).join("\n");
}
