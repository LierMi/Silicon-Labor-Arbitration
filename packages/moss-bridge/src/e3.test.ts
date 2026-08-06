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

import { verifyE3PayloadHash } from "@sla/domain";
import type { Case } from "@sla/domain";
import {
  buildE3,
  computeTransactionFingerprint,
  sanitizeRpcUrl,
  toArchivedWalletConsistency,
  type E3Provenance,
  type PreparedTask,
} from "./index.js";

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
  // 实际发给 Moss 的参数原样快照 —— 注意 requirementsHash 是**十进制**
  capabilityParams: {
    protocol: "silicon-arbitration",
    method: "createTask",
    account: "0x1111111111111111111111111111111111111111",
    amount: "0.2",
    requirementsHash: "21627158241659389656912472248746045077030315013403535262810590894243813371931",
    deadline: "1785928734",
  },
  rpcFingerprint: "https://testnet-rpc.monad.xyz",
  // 嵌套结构 —— 这正是旧写法会清空的部分
  receipt: {
    kind: "receipt",
    outcome: { taskId: "0xabc", amount: "200000000000000000" },
    changes: [{ kind: "change", data: { operation: "nativeTransfer" } }],
  },
};

const PROV: E3Provenance = {
  mossCommit: "b00ed2db0454219e468e8a0e4928c364a869fb79",
  protocolVersion: "silicon-arbitration@0.0.1",
};

const EXPLANATION = "你将把 0.2 MON 锁入托管合约。";

describe("buildE3 —— 省略 walletConsistency 的路径", () => {
  it("不抛错（回归：undefined 自有属性曾让这个调用整个崩掉）", async () => {
    const e3 = await buildE3(TASK, EXPLANATION, PROV);
    assert.match(e3.canonicalPayloadHash, /^0x[0-9a-f]{64}$/);
  });

  it("省略时该键完全不存在，而不是 undefined 或 null", async () => {
    const e3 = await buildE3(TASK, EXPLANATION, PROV);
    assert.equal("walletConsistency" in e3, false);
  });

  it("传入时会改变哈希（做了校验 ≠ 没做）", async () => {
    const without = await buildE3(TASK, EXPLANATION, PROV);
    const withWc = await buildE3(TASK, EXPLANATION, PROV, { consistent: true, mismatches: [] });
    assert.notEqual(without.canonicalPayloadHash, withWc.canonicalPayloadHash);
  });
});

describe("buildE3 —— 产出的就是最终存档形状", () => {
  it("返回值可直接赋给 Case 的 mossPreSign（类型统一后的核心保证）", async () => {
    const e3 = await buildE3(TASK, EXPLANATION, PROV);
    // 这一行的意义在编译期：类型对不上就通不过 tsc
    const evidence: NonNullable<Case["evidence"][number]["mossPreSign"]> = e3;
    assert.equal(evidence.explanation, EXPLANATION);
  });

  it("带齐 domain 要求而旧类型缺失的字段", async () => {
    const e3 = await buildE3(TASK, EXPLANATION, PROV);
    assert.equal(e3.rpcFingerprint, TASK.rpcFingerprint);
    assert.deepEqual(e3.semantics.mossCoordinate, {
      protocol: "silicon-arbitration",
      method: "createTask",
    });
    assert.equal(e3.unsignedTx.chainId, 10143);
  });

  it("溯源字段原样来自 provenance，不是写死的", async () => {
    const e3 = await buildE3(TASK, EXPLANATION, PROV);
    assert.equal(e3.mossCommit, PROV.mossCommit);
    assert.equal(e3.protocolVersion, PROV.protocolVersion);
    const other = await buildE3(TASK, EXPLANATION, { ...PROV, mossCommit: "deadbeef" });
    assert.equal(other.mossCommit, "deadbeef");
    assert.notEqual(other.canonicalPayloadHash, e3.canonicalPayloadHash);
  });

  it("walletConsistency 转成 domain 的字段名", async () => {
    const ok = await buildE3(TASK, EXPLANATION, PROV, { consistent: true, mismatches: [] });
    assert.deepEqual(ok.walletConsistency, { matched: true });

    const bad = await buildE3(TASK, EXPLANATION, PROV, {
      consistent: false,
      mismatches: ["data mismatch"],
    });
    assert.deepEqual(bad.walletConsistency, { matched: false, mismatchFields: ["data mismatch"] });
  });
});

describe("归档的必须是真实发生的，不是调用方说了算的", () => {
  it("capabilityParams 逐字段等于实际传给 Moss 的入参", async () => {
    const e3 = await buildE3(TASK, EXPLANATION, PROV);
    assert.deepEqual(e3.capabilityParams, TASK.capabilityParams);
  });

  it("归档的 requirementsHash 是十进制 —— 与发给 Moss 的一致，不是十六进制", async () => {
    const e3 = await buildE3(TASK, EXPLANATION, PROV);
    const archived = (e3.capabilityParams as Record<string, unknown>)["requirementsHash"];
    assert.match(String(archived), /^\d+$/, "必须是十进制整数串");
    assert.equal(archived, TASK.capabilityParams["requirementsHash"]);
  });

  it("rpcFingerprint 来自 task，调用方无法另行指定", async () => {
    const e3 = await buildE3(TASK, EXPLANATION, PROV);
    assert.equal(e3.rpcFingerprint, TASK.rpcFingerprint);
    // E3Provenance 上已经没有这两个字段了 —— 编译期就堵死
    assert.equal("rpcFingerprint" in PROV, false);
    assert.equal("capabilityParams" in PROV, false);
  });
});

describe("sanitizeRpcUrl —— 不得归档私密 RPC Key", () => {
  it("丢掉 query（key 常放这里）", () => {
    assert.equal(
      sanitizeRpcUrl("https://rpc.example.com/v1?apikey=SECRET123456"),
      "https://rpc.example.com/v1",
    );
  });

  it("丢掉 userinfo", () => {
    assert.equal(sanitizeRpcUrl("https://user:pass@rpc.example.com/v1"), "https://rpc.example.com/v1");
  });

  it("路径里的长段替换成 ***（那种长度基本只可能是密钥）", () => {
    assert.equal(
      sanitizeRpcUrl("https://rpc.example.com/v2/abcdef0123456789abcdef"),
      "https://rpc.example.com/v2/***",
    );
  });

  it("公共端点原样保留（服务商本身有验证价值）", () => {
    assert.equal(sanitizeRpcUrl("https://testnet-rpc.monad.xyz"), "https://testnet-rpc.monad.xyz");
  });

  it("非法 URL 不抛错", () => {
    assert.equal(sanitizeRpcUrl("не-url"), "(invalid-rpc-url)");
  });
});

describe("buildE3 → verifyE3PayloadHash 贯通", () => {
  it("刚生成的 E3 立刻自校验通过", async () => {
    const e3 = await buildE3(TASK, EXPLANATION, PROV);
    assert.equal(verifyE3PayloadHash(e3).ok, true);
  });

  it("改签前解释 → 校验失败（解释不可被事后编辑）", async () => {
    const e3 = await buildE3(TASK, EXPLANATION, PROV);
    const tampered: typeof e3 = { ...e3, explanation: "资金随时可退，无风险。" };
    assert.equal(verifyE3PayloadHash(tampered).ok, false);
  });

  it("改嵌套深处的 receipt → 校验失败", async () => {
    const e3 = await buildE3(TASK, EXPLANATION, PROV);
    const tampered: typeof e3 = {
      ...e3,
      simulation: { ...e3.simulation, receipt: { kind: "receipt", outcome: { taskId: "0xEVIL" } } },
    };
    assert.equal(verifyE3PayloadHash(tampered).ok, false);
  });

  it("带 walletConsistency 的 E3 同样自校验通过", async () => {
    const e3 = await buildE3(TASK, EXPLANATION, PROV, { consistent: false, mismatches: ["to"] });
    assert.equal(verifyE3PayloadHash(e3).ok, true);
  });

  it("同样输入得到同样哈希（确定性）", async () => {
    const a = await buildE3(TASK, EXPLANATION, PROV);
    const b = await buildE3(TASK, EXPLANATION, PROV);
    assert.equal(a.canonicalPayloadHash, b.canonicalPayloadHash);
  });
});

describe("toArchivedWalletConsistency", () => {
  it("一致时不带 mismatchFields", () => {
    assert.deepEqual(toArchivedWalletConsistency({ consistent: true, mismatches: [] }), {
      matched: true,
    });
  });

  it("不一致时原样带出差异字段", () => {
    assert.deepEqual(
      toArchivedWalletConsistency({ consistent: false, mismatches: ["to", "value"] }),
      { matched: false, mismatchFields: ["to", "value"] },
    );
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
