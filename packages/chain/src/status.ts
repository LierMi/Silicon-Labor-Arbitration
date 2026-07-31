/**
 * 合约状态 ↔ 案件状态 的映射
 *
 * ⚠️ **两套状态机不是一一对应的**，这不是 bug，是分工不同：
 *
 * ```
 * 合约有、domain 没有：  Refunded          —— 过期退款，是链上事实
 * domain 有、合约没有：  RulingProposed    —— 规则层出了判定，还没上链结算
 *                      Appealed          —— 申诉，目前只在链下流转
 * ```
 *
 * 合约只关心钱在谁手里；domain 还要表达"判定到哪一步了"。
 * 所以映射是**部分函数**，映不上的地方必须显式返回 null，不许猜。
 */

import type { CaseStatus } from "@sla/domain";
import { CONTRACT_TASK_STATUS, type ContractTaskStatus } from "./abi.js";

/** `getTaskStatus()` 返回的 uint8 → 合约枚举名 */
export function decodeContractStatus(raw: number): ContractTaskStatus | null {
  return CONTRACT_TASK_STATUS[raw] ?? null;
}

/**
 * 合约状态 → 案件状态。
 *
 * 返回 `null` 表示"链上这个状态在 domain 里没有对应项"，
 * 调用方应当保留 domain 现有的状态，而不是把它覆盖掉。
 */
export function toCaseStatus(s: ContractTaskStatus): CaseStatus | null {
  switch (s) {
    case "Created":
      return "Created";
    case "Delivered":
      return "Delivered";
    case "Accepted":
      return "Accepted";
    case "Disputed":
      return "Disputed";
    case "ManualReview":
      return "ManualReview";
    case "Settled":
      return "Settled";
    // 链上有、domain 没有 —— 不要硬塞
    case "Refunded":
    case "None":
      return null;
  }
}

/**
 * 案件状态 → 合约状态。
 *
 * `RulingProposed` 和 `Appealed` 返回 `null`：**它们是链下阶段**，
 * 链上没有对应状态。规则层出了判定但还没结算时，链上仍然停在 `Disputed`。
 */
export function toContractStatus(s: CaseStatus): ContractTaskStatus | null {
  switch (s) {
    case "Created":
      return "Created";
    case "Delivered":
      return "Delivered";
    case "Accepted":
      return "Accepted";
    case "Disputed":
      return "Disputed";
    case "ManualReview":
      return "ManualReview";
    case "Settled":
      return "Settled";
    case "RulingProposed":
    case "Appealed":
      return null;
  }
}
