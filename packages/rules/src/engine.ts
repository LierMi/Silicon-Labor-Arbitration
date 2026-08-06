/**
 * 确定性规则引擎
 *
 * 输入：Case（条款 + 证据）
 * 输出：每条条款的判定 + 结算方案
 *
 * 四条不可违背的规则：
 *   1. 主观条款**永远**是 undecidable —— 不管有没有检查器，不管 AI 怎么说
 *   2. 金额由事前承诺的 weightBps 算出，**不是**由这里选出来的
 *   3. 核心条款（essential）不成立或判不了时，附属条款权重不予单独兑现
 *   4. 全程整数运算，绝不用浮点
 */

import type { Case, RuleResult, SettlementProposal } from "@sla/domain";
import { TOTAL_WEIGHT_BPS, fromWei, splitByBps, toWei } from "@sla/domain";
import { CHECKER_VERSION, CHECKERS, extractDelivery } from "./checks.js";

/**
 * v1 → v2：引入核心条款否决（essential）。
 * **同样的输入会得出不同的分账**，所以必须换版本号——
 * 否则将来对着一份旧判定复算，会算出对不上的金额而查不出原因。
 */
export const ENGINE_VERSION = "rules-v2";

export interface RuleRunDetail {
  id: string;
  detail?: string;
}

export interface WeightBreakdown {
  satisfiedBps: number;
  violatedBps: number;
  undecidableBps: number;
}

/**
 * 核心条款否决的记录。
 *
 * `wouldHaveBeen` 是**没有这条规则时**的分账结果。保留它不是为了好看：
 * 路演要展示的正是"系统算得出 0.15，但因为核心条款判不了，一分钱都不动"——
 * 有能力自动结算，却主动克制。UI 直接读这个字段。
 */
export interface EssentialOverride {
  applied: boolean;
  /** 触发原因；未触发时为 null */
  reason: "essential_violated" | "essential_undecidable" | null;
  /** 触发否决的核心条款 id */
  triggeredBy: string[];
  /** 若不适用本规则、纯按 weightBps 分账会是什么结果 */
  wouldHaveBeen: SettlementProposal;
}

export interface RuleRunResult {
  ruleResults: RuleResult[];
  settlement: SettlementProposal;
  /** UI 可显示的判定依据，不进 canonical payload */
  details: RuleRunDetail[];
  engineVersion: string;
  checkerVersion: string;
  /** 权重分配的可复算说明，用来回答"0.05 是怎么来的"（否决前的原始分桶） */
  weightBreakdown: WeightBreakdown;
  /** 核心条款否决是否生效 */
  essentialOverride: EssentialOverride;
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

/**
 * 校验核心条款标注：必须每条都显式声明。
 *
 * 不给默认值，是因为 essential 和 weightBps 一样要进 `requirementsHash`。
 * 一个静默的默认值意味着"承诺了什么"取决于代码版本，那这个哈希就白承诺了。
 */
export function assertEssentialFlags(c: Case): void {
  const missing = c.requirements.filter((r) => typeof r.essential !== "boolean");
  if (missing.length > 0) {
    throw new Error(
      `条款缺少 essential 标注：${missing.map((r) => r.id).join(", ")} —— 不可分给付无从判断`,
    );
  }
}

/** 把权重分桶换算成结算方案（整数运算，余数归入冻结） */
function settleFromBps(totalWei: bigint, bps: WeightBreakdown): SettlementProposal {
  const split = splitByBps(totalWei, [
    { key: "toAgent", bps: bps.satisfiedBps },
    { key: "toClient", bps: bps.violatedBps },
    { key: "frozen", bps: bps.undecidableBps },
  ]);
  // 整数除法的余数归入冻结：拿不准的钱留住，不发出去
  const frozenWei = (split["frozen"] ?? 0n) + (split["__dust"] ?? 0n);
  return {
    toAgent: fromWei(split["toAgent"] ?? 0n),
    toClient: fromWei(split["toClient"] ?? 0n),
    frozen: fromWei(frozenWei),
  };
}

export function runRules(c: Case): RuleRunResult {
  assertWeights(c);
  assertEssentialFlags(c);

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
  const wouldHaveBeen = settleFromBps(totalWei, bucket);

  // ── 规则 3：核心条款否决 ──────────────────────────────
  // 加权求和假设条款可分割。核心条款一旦不成立或判不了，这个假设就破了：
  // 交付物整体不可用，附属条款做到了也没有独立价值。
  //
  // violated 优先于 undecidable：已经确定不合格，不必再等另一条判出来。
  const essentials = c.requirements.filter((r) => r.essential);
  const verdictOf = (id: string) => ruleResults.find((r) => r.id === id)?.verdict;
  const violated = essentials.filter((r) => verdictOf(r.id) === "violated");
  const undecidable = essentials.filter((r) => verdictOf(r.id) === "undecidable");

  let effectiveBps = bucket;
  let override: EssentialOverride = {
    applied: false,
    reason: null,
    triggeredBy: [],
    wouldHaveBeen,
  };

  if (violated.length > 0) {
    // 核心条款确定不成立 → 全额退委托人
    effectiveBps = { satisfiedBps: 0, violatedBps: TOTAL_WEIGHT_BPS, undecidableBps: 0 };
    override = {
      applied: true,
      reason: "essential_violated",
      triggeredBy: violated.map((r) => r.id),
      wouldHaveBeen,
    };
  } else if (undecidable.length > 0) {
    // 核心条款判不了 → 全额冻结。
    // 这里绝不能按权重先付一部分：那等于替人做了"附属条款值 75%"的判断，
    // 而我们的立场恰恰是判不了就不判。
    effectiveBps = { satisfiedBps: 0, violatedBps: 0, undecidableBps: TOTAL_WEIGHT_BPS };
    override = {
      applied: true,
      reason: "essential_undecidable",
      triggeredBy: undecidable.map((r) => r.id),
      wouldHaveBeen,
    };
  }

  return {
    ruleResults,
    settlement: settleFromBps(totalWei, effectiveBps),
    details,
    engineVersion: ENGINE_VERSION,
    checkerVersion: CHECKER_VERSION,
    weightBreakdown: bucket,
    essentialOverride: override,
  };
}

/** 把判定与结算写回案件（返回新对象，不改原件） */
export function applyRules(c: Case): Case {
  const run = runRules(c);
  return { ...c, ruleResults: run.ruleResults, settlementProposal: run.settlement };
}
