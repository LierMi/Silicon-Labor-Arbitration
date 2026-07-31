/**
 * Direct 路径的交易证据
 *
 * ## 为什么单独一个文件
 *
 * `docs/08` 定的边界：**只有 `createTask` 走 Moss，其他生命周期操作走 Direct 路径。**
 * Direct 路径产生的证据**不得标成 Moss 来源**，也不得宣称是 "Moss verified"。
 *
 * 这条约束在 `@sla/domain` 的校验器里是 P0（`DIRECT_FAKED_AS_MOSS`）。
 * 这里提供唯一正确的构造方式，让人没有机会标错。
 */

import type { Evidence } from "@sla/domain";
import type { Hex } from "./tx.js";

/** Direct 路径能产生证据的那些操作 */
export type DirectAction =
  | "assignAgent"
  | "submitDelivery"
  | "acceptDelivery"
  | "openDispute"
  | "settle"
  | "releaseFrozen"
  | "refundExpiredTask"
  | "withdrawPayment"
  | "createTask";

const ACTION_LABEL: Record<DirectAction, string> = {
  assignAgent: "指派承接 Agent",
  submitDelivery: "提交交付物",
  acceptDelivery: "验收并付款",
  openDispute: "发起争议",
  settle: "结算分账",
  releaseFrozen: "人工释放冻结资金",
  refundExpiredTask: "过期退款",
  withdrawPayment: "提取待付款项",
  createTask: "创建任务（无 Moss 降级路径）",
};

/**
 * 构造一条 Direct 路径的链上交易证据。
 *
 * `source` 被写死为 `"direct"`，**没有参数可以改它**——
 * 这是为了让"把 Direct 交易标成 Moss 证据"这件事在类型层面做不到。
 */
export function buildDirectTxEvidence(params: {
  id: string;
  action: DirectAction;
  txHash: Hex;
  /** 链上区块时间，ISO 8601。没有就用交易被确认的时刻 */
  ts: string;
  note?: string;
}): Evidence {
  return {
    id: params.id,
    kind: "direct_tx",
    source: "direct", // ← 写死，不接受外部传入
    label: `${ACTION_LABEL[params.action]}（链上交易）`,
    ts: params.ts,
    txHash: params.txHash,
    ...(params.note ? { text: params.note } : {}),
  };
}

/**
 * 一句提醒，给写 UI 的人看：
 *
 * 界面上区分证据来源时，Direct 和 Moss 要有**视觉上的区别**。
 * 不是为了好看，是为了不让人误以为后续操作也有签前模拟证据。
 */
export const PROVENANCE_NOTE =
  "Direct 路径只有链上交易回执，没有签前解释和模拟结果——" +
  "那是 Moss 路径独有的（目前只有 createTask 走 Moss）。";
