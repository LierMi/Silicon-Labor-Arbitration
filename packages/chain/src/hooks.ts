/**
 * wagmi hooks
 *
 * 全部是 `src/tx.ts` 里纯函数的薄包装——逻辑和校验都在那一层，
 * 这里只负责接上 wagmi 的 `writeContract`。
 *
 * 这样拆的好处：不起 React 就能测参数构造对不对。
 */

import { useCallback } from "react";
import { useWriteContract } from "wagmi";
import {
  buildAcceptDelivery,
  buildAssignAgent,
  buildCreateTaskDirect,
  buildOpenDispute,
  buildRefundExpiredTask,
  buildReleaseFrozen,
  buildSettle,
  buildSubmitDelivery,
  buildWithdrawPayment,
  type Hex,
  type TxRequest,
} from "./tx.js";

/** 所有写操作共用的返回形状 */
function useTaskEscrowWrite<A extends unknown[]>(build: (...args: A) => TxRequest) {
  const { writeContractAsync, ...rest } = useWriteContract();
  const send = useCallback(
    (...args: A) => writeContractAsync(build(...args) as never),
    [writeContractAsync, build],
  );
  return { send, ...rest };
}

/**
 * ⚠️ 无 Moss 的降级路径。P0 主路径请用 `packages/moss-bridge`。
 * 用它产生的证据**不得标成 Moss verified**。
 */
export const useCreateTaskDirect = () => useTaskEscrowWrite(buildCreateTaskDirect);

export const useAssignAgent = () => useTaskEscrowWrite(buildAssignAgent);
export const useSubmitDelivery = () => useTaskEscrowWrite(buildSubmitDelivery);
export const useAcceptDelivery = () => useTaskEscrowWrite(buildAcceptDelivery);
export const useRefundExpiredTask = () => useTaskEscrowWrite(buildRefundExpiredTask);
export const useOpenDispute = () => useTaskEscrowWrite(buildOpenDispute);

/** 只有 settlementAuthority 能成功；其他人调用会 revert Unauthorized */
export const useSettle = () => useTaskEscrowWrite(buildSettle);

/** 「空章位」背后真正发生的事：人做出决定，把决定哈希写上链，冻结的钱才动 */
export const useReleaseFrozen = () => useTaskEscrowWrite(buildReleaseFrozen);

export const useWithdrawPayment = () => useTaskEscrowWrite(buildWithdrawPayment);

export type { Hex, TxRequest };
