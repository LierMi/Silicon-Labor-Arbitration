/**
 * 交易参数构造（纯函数，不依赖 React，可单测）
 *
 * wagmi hooks 只是这一层的薄包装。把逻辑放在这里的好处是：
 * 不用起 React 就能验证参数对不对。
 *
 * ## 三条写进代码的约束
 *
 * 1. **deadline 必须运行时计算** —— 构造 createTask 时强制过一次闸门，
 *    杜绝把案件样例里那个固定日期传进来（会 revert，且重复演示撞 taskId）。
 * 2. **金额一律走 domain 的 wei 转换** —— 不用 `parseEther`，
 *    保证和规则引擎用的是同一套整数运算。
 * 3. **Direct 路径的证据来源必须标 `direct`** —— 见 `evidence.ts`。
 */

import { assertUsableDeadline, deadlineFromNow, toWei } from "@sla/domain";
import { taskEscrowAbi } from "./abi.js";
import { TASK_ESCROW_ADDRESS } from "./config.js";

export type Hex = `0x${string}`;

/** wagmi `useWriteContract` 的 `writeContract()` 入参形状 */
export interface TxRequest {
  address: Hex;
  abi: typeof taskEscrowAbi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
}

const base = { address: TASK_ESCROW_ADDRESS, abi: taskEscrowAbi } as const;

// ────────────────────────────────────────────────────────────
// createTask —— ⚠️ 只在没有 Moss 时用
// ────────────────────────────────────────────────────────────

/**
 * ⚠️ **这是「没有 Moss 的降级演示」路径，不是 P0 主路径。**
 *
 * 按 `docs/08`，`createTask` 的 P0 主路径必须经过 Moss Protocol Capability
 * 构造并模拟，产出可验证的 E3 签前证据（见 `packages/moss-bridge`）。
 * 前端自行 encode 拿不到完整 Receipt 验证，**不得标成 "Moss verified"**。
 *
 * 保留它是为了：Moss 那条链路没通时，demo 仍然能跑完。
 *
 * @param amountMon 十进制字符串，如 "0.2"
 * @param deadlineHours 从现在起多少小时后截止，默认 1
 */
export function buildCreateTaskDirect(
  requirementsHash: Hex,
  amountMon: string,
  deadlineHours = 1,
): TxRequest {
  // 约束 1：deadline 必须是运行时算出来的，且过闸门
  const deadline = deadlineFromNow(deadlineHours);
  assertUsableDeadline(deadline);

  // 约束 2：金额走 domain 的整数转换
  const value = toWei(amountMon);
  if (value === 0n) throw new Error("托管金额不能为 0，合约会 revert ZeroEscrowAmount");
  if (requirementsHash === "0x" || /^0x0+$/.test(requirementsHash)) {
    throw new Error("requirementsHash 不能为空，合约会 revert EmptyRequirementsHash");
  }

  return { ...base, functionName: "createTask", args: [requirementsHash, deadline], value };
}

// ────────────────────────────────────────────────────────────
// Direct 路径：后续生命周期操作
// ────────────────────────────────────────────────────────────

/** 委托人指派承接的 Agent。只有 client 能调。 */
export function buildAssignAgent(taskId: Hex, agent: Hex): TxRequest {
  if (/^0x0+$/.test(agent)) throw new Error("Agent 地址不能为零地址");
  return { ...base, functionName: "assignAgent", args: [taskId, agent] };
}

/** Agent 提交交付物哈希。只有被指派的 Agent 能调，且必须在 deadline 之前。 */
export function buildSubmitDelivery(taskId: Hex, deliveryHash: Hex): TxRequest {
  if (/^0x0+$/.test(deliveryHash)) {
    throw new Error("deliveryHash 不能为空，合约会 revert EmptyDeliveryHash");
  }
  return { ...base, functionName: "submitDelivery", args: [taskId, deliveryHash] };
}

/** 委托人验收，全额付给 Agent。只有 client 能调。 */
export function buildAcceptDelivery(taskId: Hex): TxRequest {
  return { ...base, functionName: "acceptDelivery", args: [taskId] };
}

/** 过了 deadline 仍未交付时，委托人取回资金。只有 client 能调。 */
export function buildRefundExpiredTask(taskId: Hex): TxRequest {
  return { ...base, functionName: "refundExpiredTask", args: [taskId] };
}

/** 发起争议。client 或 agent 都能调。 */
export function buildOpenDispute(taskId: Hex): TxRequest {
  return { ...base, functionName: "openDispute", args: [taskId] };
}

/**
 * 结算。**只有 settlementAuthority 能调。**
 *
 * 金额来自规则引擎的 `SettlementProposal`（按事前承诺的 weightBps 算出），
 * 这里只做搬运，不重新计算——链上也不重算，只校验守恒。
 */
export function buildSettle(
  caseId: Hex,
  proposal: { toAgent: string; toClient: string; frozen: string },
  settlementProposalHash: Hex,
): TxRequest {
  if (/^0x0+$/.test(settlementProposalHash)) {
    throw new Error("settlementProposalHash 不能为空，合约会 revert");
  }
  return {
    ...base,
    functionName: "settle",
    args: [
      caseId,
      toWei(proposal.toAgent),
      toWei(proposal.toClient),
      toWei(proposal.frozen),
      settlementProposalHash,
    ],
  };
}

/**
 * 人类终审：释放冻结的那部分。**只有 settlementAuthority 能调。**
 *
 * 这是「空章位」那一帧背后真正发生的事——C4 判不了，钱冻在链上，
 * 直到有人做出决定并把决定的哈希写上链。
 */
export function buildReleaseFrozen(
  caseId: Hex,
  toAgentMon: string,
  toClientMon: string,
  reviewDecisionHash: Hex,
): TxRequest {
  if (/^0x0+$/.test(reviewDecisionHash)) {
    throw new Error("reviewDecisionHash 不能为空，合约会 revert EmptyReviewDecisionHash");
  }
  return {
    ...base,
    functionName: "releaseFrozen",
    args: [caseId, toWei(toAgentMon), toWei(toClientMon), reviewDecisionHash],
  };
}

/** 提取因推送失败而转为可提取额度的钱。债权人本人调。 */
export function buildWithdrawPayment(taskId: Hex, recipient: Hex): TxRequest {
  return { ...base, functionName: "withdrawPayment", args: [taskId, recipient] };
}
