/**
 * 案件数据一致性校验
 *
 * 这些不是"锦上添花的检查"，是把 AGENTS.md 的产品不变量写成代码：
 *   - AI 意见的 cites 不得为空，且必须引用真实存在的证据
 *   - 主观条款必须是 undecidable，客观条款不得是 undecidable
 *   - Direct 路径的证据不得标成 Moss 来源
 *   - 有 undecidable 就必须有冻结金额
 *
 * 规则引擎与 AI 层在写入前都应先跑一遍这里。
 */

import type { Case } from "./case.js";
import { CASE_STATUSES } from "./status.js";

export interface ValidationIssue {
  level: "error" | "warn";
  code: string;
  message: string;
}

export function validateCase(c: Case): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string) =>
    issues.push({ level: "error", code, message });
  const warn = (code: string, message: string) =>
    issues.push({ level: "warn", code, message });

  const evidenceIds = new Set(c.evidence.map((e) => e.id));
  const requirementIds = new Set(c.requirements.map((r) => r.id));

  if (!CASE_STATUSES.includes(c.status)) {
    err("STATUS_UNKNOWN", `未知状态 ${c.status}`);
  }

  // ── 条款与判定一一对应 ──
  for (const r of c.requirements) {
    const result = c.ruleResults.find((x) => x.id === r.id);
    if (!result) {
      err("RULE_MISSING", `条款 ${r.id} 缺少判定结果`);
      continue;
    }
    if (r.type === "subjective" && result.verdict !== "undecidable") {
      err(
        "SUBJECTIVE_DECIDED",
        `主观条款 ${r.id} 被判成 ${result.verdict}——主观条款必须保持 undecidable`,
      );
    }
    if (r.type === "objective" && result.verdict === "undecidable") {
      warn("OBJECTIVE_UNDECIDED", `客观条款 ${r.id} 判成 undecidable，请确认是否缺证据`);
    }
  }
  for (const result of c.ruleResults) {
    if (!requirementIds.has(result.id)) {
      err("RULE_ORPHAN", `判定结果 ${result.id} 找不到对应条款`);
    }
    if (result.verdict === "undecidable" && !result.reason) {
      err("UNDECIDABLE_NO_REASON", `${result.id} 判为 undecidable 但没有写明原因`);
    }
    for (const b of result.basis) {
      if (!evidenceIds.has(b)) {
        err("RULE_BASIS_UNKNOWN", `${result.id} 引用了不存在的证据 ${b}`);
      }
    }
  }

  // ── AI 意见：引用为空即拒绝 ──
  for (const a of c.aiArguments) {
    if (a.cites.length === 0) {
      err("AI_NO_CITES", `${a.role} 意见没有引用任何证据——引用为空的意见必须被拒绝`);
    }
    for (const cite of a.cites) {
      if (!evidenceIds.has(cite)) {
        err("AI_CITE_UNKNOWN", `${a.role} 引用了不存在的证据 ${cite}`);
      }
    }
    for (const u of a.uncertain) {
      if (!requirementIds.has(u)) {
        err("AI_UNCERTAIN_UNKNOWN", `${a.role} 标注了不存在的条款 ${u}`);
      }
    }
  }

  // ── 证据来源不得伪装 ──
  for (const e of c.evidence) {
    if (e.kind === "moss_pre_sign_explanation") {
      if (e.source !== "moss") {
        err("E3_SOURCE", `${e.id} 是 Moss 签前证据，来源必须是 moss`);
      }
      if (!e.mossPreSign) {
        err("E3_EMPTY", `${e.id} 缺少结构化的 mossPreSign——E3 不能只是一段文本`);
      }
    }
    if (e.kind === "direct_tx" && e.source === "moss") {
      err("DIRECT_FAKED_AS_MOSS", `${e.id} 是 Direct 路径交易，不得标成 Moss 来源`);
    }
  }

  // ── 结算：有 undecidable 就必须有冻结 ──
  const hasUndecided = c.ruleResults.some((r) => r.verdict === "undecidable");
  const s = c.settlementProposal;
  if (s) {
    const frozen = Number(s.frozen);
    if (hasUndecided && !(frozen > 0)) {
      err(
        "NO_FROZEN_FOR_UNDECIDABLE",
        "存在不可裁决条款，但冻结金额为 0——不可裁决的部分必须冻结等待人类终审",
      );
    }
    if (!hasUndecided && frozen > 0) {
      warn("FROZEN_WITHOUT_UNDECIDABLE", "没有不可裁决条款却冻结了资金，请确认原因");
    }
    if (c.onchain.amount !== undefined) {
      const total = Number(s.toAgent) + Number(s.toClient) + frozen;
      if (Math.abs(total - Number(c.onchain.amount)) > 1e-9) {
        err(
          "SETTLEMENT_SUM",
          `结算总额 ${total} 与托管金额 ${c.onchain.amount} 不一致`,
        );
      }
    }
  } else if (c.status === "Settled") {
    err("SETTLED_NO_PROPOSAL", "状态为已结算但没有结算方案");
  }

  // ── 责任链 ──
  for (const hop of c.responsibilityChain) {
    for (const ref of hop.evidenceRefs) {
      if (!evidenceIds.has(ref)) {
        err("HOP_EVIDENCE_UNKNOWN", `责任链 ${hop.id} 引用了不存在的证据 ${ref}`);
      }
    }
  }

  return issues;
}

export function assertValidCase(c: Case): void {
  const errors = validateCase(c).filter((i) => i.level === "error");
  if (errors.length > 0) {
    throw new Error(
      `案件 ${c.caseNo} 校验失败：\n` + errors.map((e) => `  [${e.code}] ${e.message}`).join("\n"),
    );
  }
}
