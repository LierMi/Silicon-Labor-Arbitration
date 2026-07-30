/**
 * 案件状态机
 *
 * Created ──→ Delivered ──→ Accepted ──→ (终态)
 *                        ↘
 *                         Disputed ──→ RulingProposed ──→ Settled ──→ (终态)
 *                                                      ↘
 *                                                       Appealed ──→ ManualReview ──→ (终态)
 *
 * UI 必须能渲染全部 8 个状态，每个状态都要有空态与加载态。
 */

export const CASE_STATUSES = [
  "Created",
  "Delivered",
  "Accepted",
  "Disputed",
  "RulingProposed",
  "Settled",
  "Appealed",
  "ManualReview",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

/** 每个状态允许迁移到哪些状态。空数组 = 终态。 */
export const CASE_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  Created: ["Delivered"],
  Delivered: ["Accepted", "Disputed"],
  Accepted: [],
  Disputed: ["RulingProposed"],
  RulingProposed: ["Settled", "Appealed"],
  Settled: [],
  Appealed: ["ManualReview"],
  ManualReview: [],
};

/** 终态：不再有后续迁移 */
export const TERMINAL_STATUSES: readonly CaseStatus[] = ["Accepted", "Settled", "ManualReview"];

/** UI 展示用的中文标签 */
export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  Created: "已立案",
  Delivered: "已交付",
  Accepted: "已验收",
  Disputed: "争议中",
  RulingProposed: "已出判定",
  Settled: "已结算",
  Appealed: "已申诉",
  ManualReview: "待人工复核",
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return CASE_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: CaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
