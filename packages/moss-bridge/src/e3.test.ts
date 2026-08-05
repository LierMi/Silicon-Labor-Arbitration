/**
 * buildE3 的回归测试
 *
 * 跑：`pnpm --filter @sla/moss-bridge test`
 *
 * 不连网络：`buildE3` 只接受一个已经准备好的 `PreparedTask`，
 * 所以用桩数据就能覆盖。真正连 Monad Testnet 的那一步在 `prepareCreateTask`，
 * 不在这里。
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { buildE3, computeTransactionFingerprint, type PreparedTask } from "./index.js";

const TASK: PreparedTask = {
  unsignedTransaction: {
    to: "0x67040374b8A9756586De0885f01d1291cE8FFCcF",
    data: "0x6fbb5f62dead",
    value: "0x2c68af0bb140000",
    from: "0x1111111111111111111111111111111111111111",
  },
  estimatedGas: "218304",
  simulationFailed: false,
  warnings: [],
  evidenceHash: null,
  // 嵌套结构 —— 这正是旧写法会清空的部分
  receipt: {
    kind: "receipt",
    outcome: { taskId: "0xabc", amount: "200000000000000000" },
    changes: [{ kind: "change", data: { operation: "nativeTransfer" } }],
  },
};

const EXPLANATION = "你将把 0.2 MON 锁入托管合约。";

describe("buildE3", () => {
  it("两参数调用不再抛错（省略 walletConsistency）", async () => {
    // 回归：`{ walletConsistency }` 简写会造出值为 undefined 的自有属性，
    // canonicalJson 拒绝 undefined，于是这个调用整个崩掉。
    const e3 = await buildE3(TASK, EXPLANATION);
    assert.equal(typeof e3.canonicalPayloadHash, "string");
    assert.match(e3.canonicalPayloadHash, /^0x[0-9a-f]{64}$/);
  });

  it("省略时该键完全不存在，而不是 undefined 或 null", async () => {
    const e3 = await buildE3(TASK, EXPLANATION);
    assert.equal("walletConsistency" in e3, false);
  });

  it("传入 walletConsistency 时会改变哈希（有做校验 ≠ 没做）", async () => {
    const without = await buildE3(TASK, EXPLANATION);
    const withWc = await buildE3(TASK, EXPLANATION, { consistent: true, mismatches: [] });
    assert.notEqual(without.canonicalPayloadHash, withWc.canonicalPayloadHash);
  });

  it("哈希覆盖嵌套的 receipt —— 只改深层字段也会变", async () => {
    const a = await buildE3(TASK, EXPLANATION);
    const mutated: PreparedTask = {
      ...TASK,
      receipt: { ...(TASK.receipt as object), outcome: { taskId: "0xdifferent" } },
    };
    const b = await buildE3(mutated, EXPLANATION);
    assert.notEqual(a.canonicalPayloadHash, b.canonicalPayloadHash);
  });

  it("改签前解释会改变哈希 —— 解释不可被事后编辑", async () => {
    const a = await buildE3(TASK, EXPLANATION);
    const b = await buildE3(TASK, "资金随时可退，无风险。");
    assert.notEqual(a.canonicalPayloadHash, b.canonicalPayloadHash);
  });

  it("同样输入得到同样哈希（确定性）", async () => {
    const a = await buildE3(TASK, EXPLANATION);
    const b = await buildE3(TASK, EXPLANATION);
    assert.equal(a.canonicalPayloadHash, b.canonicalPayloadHash);
  });
});

describe("computeTransactionFingerprint", () => {
  it("确定性，且任一字段变化都会改变指纹", () => {
    const base = TASK.unsignedTransaction;
    assert.equal(computeTransactionFingerprint(base), computeTransactionFingerprint(base));
    assert.notEqual(
      computeTransactionFingerprint(base),
      computeTransactionFingerprint({ ...base, value: "0x1" }),
    );
  });
});
