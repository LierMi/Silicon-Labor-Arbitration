/**
 * 合约入参用的 deadline
 *
 * ## 为什么需要这个文件
 *
 * `TaskEscrow.createTask` 有两条硬约束，都会让 demo 当场跑不起来：
 *
 * ```solidity
 * if (deadline <= block.timestamp) revert DeadlineNotFuture(...);
 * taskId = keccak256(abi.encode(chainid, address(this), msg.sender,
 *                               requirementsHash, deadline, msg.value));
 * if (tasks[taskId].client != address(0)) revert TaskAlreadyExists(taskId);
 * ```
 *
 * 1. **deadline 必须在未来** —— 案件样例里那个写死的日期，到路演当天已经过期。
 * 2. **taskId 完全由参数决定，没有随机项** —— 同一个钱包用同样的参数创建第二次会
 *    直接 revert。彩排跑两遍就会撞上。
 *
 * 两条靠同一件事解决：**deadline 在运行时算，不要读样例里的固定日期。**
 *
 * ⚠️ 陷阱：把样例里的日期往后挪（`2026-08-01` → `2026-09-01`）只解决了第 1 条，
 *    第 2 条还在。必须是"运行时计算"，不是"换个更晚的固定值"。
 */

/** 默认给一小时的交付窗口 */
export const DEFAULT_DEADLINE_HOURS = 1;

/**
 * ✅ **调用 `createTask` 时用这个。**
 *
 * 返回从现在起 N 小时后的 Unix 秒时间戳。每次调用值都不同，
 * 所以 `taskId` 天然唯一，重复演示不会撞。
 */
export function deadlineFromNow(hours: number = DEFAULT_DEADLINE_HOURS): bigint {
  if (!(hours > 0)) throw new Error(`deadline 必须在未来，收到 hours=${hours}`);
  return BigInt(Math.floor(Date.now() / 1000) + Math.floor(hours * 3600));
}

/**
 * ❌ **不要把这个结果传给 `createTask`。**
 *
 * 只用于把案件里的 ISO 时间转成时间戳做比较（比如规则引擎判「是否按时交付」）。
 * 传给合约会 revert —— 要么过期，要么和上一次演示撞 taskId。
 */
export function isoToUnixSeconds(iso: string): bigint {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`不是合法的 ISO 时间：${iso}`);
  return BigInt(Math.floor(ms / 1000));
}

/**
 * 发交易前的最后一道闸。
 *
 * 把合约那个不透明的 `DeadlineNotFuture` revert，提前变成本地一条说人话的错误。
 * hooks 在构造交易时应当调用它。
 */
export function assertUsableDeadline(deadline: bigint): void {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (deadline <= now) {
    throw new Error(
      `deadline 已过期（${new Date(Number(deadline) * 1000).toISOString()}），` +
        `合约会 revert DeadlineNotFuture。` +
        `请用 deadlineFromNow() 在运行时计算，不要使用案件样例里写死的日期。`,
    );
  }
}
