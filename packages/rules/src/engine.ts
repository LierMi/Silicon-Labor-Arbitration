/**
 * 确定性规则引擎
 *
 * 输入：Case（条款 + 证据）
 * 输出：每条条款的判定 + 结算方案
 *
 * 三条不可违背的规则：
 *   1. 主观条款**永远**是 undecidable —— 不管有没有检查器，不管 AI 怎么说
 *   2. 金额由事前承诺的 weightBps 算出，**不是**由这里选出来的
 *   3. 全程整数运算，绝不用浮点
 */

import type { Case, RuleResult, SettlementProposal } from "@sla/domain";
import { TOTAL_WEIGHT_BPS, fromWei, splitByBps, toWei } from "@sla/domain";
import { CHECKER_VERSION, CHECKERS, extractDelivery } from "./checks.js";

export const ENGINE_VERSION = "rules-v1";

export interface RuleRunDetail {
  id: string;
  detail?: string;
}

export interface RuleRunResult {
  ruleResults: RuleResult[];
  settlement: SettlementProposal;
  /** UI 可显示的判定依据，不进 canonical payload */
  details: RuleRunDetail[];
  engineVersion: string;
  checkerVersion: string;
  /** 权重分配的可复算说明，用来回答"0.05 是怎么来的" */
  weightBreakdown: {
    satisfiedBps: number;
    violatedBps: number;
    undecidableBps: number;
  };
}

/** 校验权重：必须每条都有，且总和为 10000 */
export function assertWeights(c: Case): void {
  const missing = c.requirements.filter((r) => typeof r.weightBps !== "number");
  if (missing.length > 0) {
    throw new Error(`条款缺少 weightBps：${missing.map((r) => r.id).join(", ")}`);
  }
  const sum = c.requirements.reduce((a, r) => a + r.weightBps, 0);
  if (sum !== TOTAL_WEIGHT_BPS) {
    throw new Error(`权重之和必须为 ${TOTAL_WEIGHT_BPS} bps，实际为 ${sum}`);
  }
}

export function runRules(c: Case): RuleRunResult {
  assertWeights(c);

  const delivery = extractDelivery(c);
  const ruleResults: RuleResult[] = [];
  const details: RuleRunDetail[] = [];

  for (const requirement of c.requirements) {
    // ── 规则 1：主观条款永远不判 ──────────────────────────
    // 这一条放在最前面且没有任何 else 分支，是刻意的：
    // 即使将来有人给主观条款登记了检查器，也走不到那里。
    if (requirement.type === "subjective") {
      ruleResults.push({
        id: requirement.id,
        verdict: "undecidable",
        basis: [],
        reason: "主观条件，确定性规则层无法判定。转人工复核。",
      });
      continue;
    }

    const checker = CHECKERS[requirement.check];
    if (!checker) {
      ruleResults.push({
        id: requirement.id,
        verdict: "undecidable",
        basis: [],
        reason: `没有登记名为 ${requirement.check} 的确定性检查器`,
      });
      continue;
    }

    const outcome = checker({ requirement, delivery });
    ruleResults.push({
      id: requirement.id,
      verdict: outcome.verdict,
      basis: outcome.basis,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    });
    if (outcome.detail) details.push({ id: requirement.id, detail: outcome.detail });
  }

  // ── 规则 2：金额由事前权重算出 ────────────────────────
  const bucket = { satisfiedBps: 0, violatedBps: 0, undecidableBps: 0 };
  for (const requirement of c.requirements) {
    const verdict = ruleResults.find((r) => r.id === requirement.id)?.verdict;
    if (verdict === "satisfied") bucket.satisfiedBps += requirement.weightBps;
    else if (verdict === "violated") bucket.violatedBps += requirement.weightBps;
    else bucket.undecidableBps += requirement.weightBps;
  }

  const totalWei = toWei(c.onchain.amount ?? "0");
  const split = splitByBps(totalWei, [
    { key: "toAgent", bps: bucket.satisfiedBps },
    { key: "toClient", bps: bucket.violatedBps },
    { key: "frozen", bps: bucket.undecidableBps },
  ]);

  // 整数除法的余数归入冻结：拿不准的钱留住，不发出去
  const frozenWei = (split["frozen"] ?? 0n) + (split["__dust"] ?? 0n);

  const settlement: SettlementProposal = {
    toAgent: fromWei(split["toAgent"] ?? 0n),
    toClient: fromWei(split["toClient"] ?? 0n),
    frozen: fromWei(frozenWei),
  };

  return {
    ruleResults,
    settlement,
    details,
    engineVersion: ENGINE_VERSION,
    checkerVersion: CHECKER_VERSION,
    weightBreakdown: bucket,
  };
}

/** 把判定与结算写回案件（返回新对象，不改原件） */
export function applyRules(c: Case): Case {
  const run = runRules(c);
  return { ...c, ruleResults: run.ruleResults, settlementProposal: run.settlement };
}
