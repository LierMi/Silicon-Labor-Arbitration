/**
 * canonical 序列化 / 证据哈希边界的回归测试
 *
 * 用 Node 自带的 `node:test`，不引入测试框架依赖。
 * 跑：`pnpm test`（根目录）或 `pnpm --filter @sla/domain test`
 *
 * ## 为什么这些用例值得存在
 *
 * 这个文件里几乎每一条都对应一个**真实发生过的错误**，不是假想的边界：
 *
 *   - Date/Map/Set 碰撞：注释声称会报错，代码实际序列化成 `{}`
 *   - undefined 属性：`buildE3(task, explanation)` 两参数调用直接崩
 *   - 嵌套被清空：`JSON.stringify(o, keys)` 不是排序器
 *
 * 哈希是"承诺"机制的底座。**它错了不会崩，只会静默地让承诺失效**，
 * 所以只能靠测试兜住。
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  CANONICAL_VERSION,
  canonicalJson,
  canonicalizeRequirements,
  computeRequirementsHash,
} from "./canonical.js";
import { POTATO_CASE, POTATO_REQUIREMENTS, POTATO_REQUIREMENTS_HASH } from "./fixtures/potato-case.js";
import type { Requirement } from "./case.js";
import { validateCase } from "./validate.js";

const REQ = (over: Partial<Requirement> = {}): Requirement => ({
  id: "C1",
  type: "objective",
  check: "file_format",
  expect: "PNG",
  label: "文件格式为 PNG",
  weightBps: 10_000,
  essential: false,
  ...over,
});

// ────────────────────────────────────────────────────────────
describe("canonicalJson —— 接受什么", () => {
  it("键按升序排列，与写入顺序无关", () => {
    assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
    assert.equal(canonicalJson({ a: 2, b: 1 }), '{"a":2,"b":1}');
  });

  it("嵌套对象完整保留 —— JSON.stringify(o, keys) 的坑不能重现", () => {
    const input = { b: 1, a: { nested: 2, other: 3 } };
    assert.equal(canonicalJson(input), '{"a":{"nested":2,"other":3},"b":1}');
    // 对照：旧写法会把嵌套清空
    assert.equal(JSON.stringify(input, Object.keys(input).sort()), '{"a":{},"b":1}');
  });

  it("数组保持原顺序（顺序有语义）", () => {
    assert.equal(canonicalJson([3, 1, 2]), "[3,1,2]");
    assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  });

  it("null / 布尔 / 整数 / 字符串", () => {
    assert.equal(canonicalJson(null), "null");
    assert.equal(canonicalJson(true), "true");
    assert.equal(canonicalJson(-42), "-42");
    assert.equal(canonicalJson("中文「引号」"), '"中文「引号」"');
  });

  it("Object.create(null) 视为朴素对象", () => {
    const o = Object.create(null) as Record<string, unknown>;
    o["x"] = 1;
    assert.equal(canonicalJson(o), '{"x":1}');
  });

  it("深层嵌套逐层规范化", () => {
    assert.equal(
      canonicalJson({ z: { y: { x: [{ b: 1, a: 2 }] } } }),
      '{"z":{"y":{"x":[{"a":2,"b":1}]}}}',
    );
  });
});

// ────────────────────────────────────────────────────────────
describe("canonicalJson —— 必须拒绝什么", () => {
  // 回归：这四者原本全部序列化成 "{}"，彼此碰撞，也与空对象碰撞
  for (const [name, value] of [
    ["Date", new Date("2026-08-01T12:00:00Z")],
    ["Map", new Map([["a", 1]])],
    ["Set", new Set([1, 2])],
    ["RegExp", /x/],
    ["类实例", new (class Foo { x = 1 })()],
  ] as const) {
    it(`拒绝 ${name}（原本会静默变成 {}，与空对象碰撞）`, () => {
      assert.throws(() => canonicalJson(value), /朴素对象/);
    });
  }

  it("空对象本身仍然合法，且与上述类型不再同值", () => {
    assert.equal(canonicalJson({}), "{}");
  });

  it("拒绝 undefined 属性（buildE3 两参数调用崩过的那个）", () => {
    assert.throws(() => canonicalJson({ a: 1, b: undefined }), /undefined/);
  });

  it("拒绝顶层 undefined / 函数 / symbol / BigInt", () => {
    assert.throws(() => canonicalJson(undefined));
    assert.throws(() => canonicalJson(() => 1));
    assert.throws(() => canonicalJson(Symbol("s")));
    assert.throws(() => canonicalJson(1n));
  });

  it("拒绝浮点 / NaN / Infinity", () => {
    assert.throws(() => canonicalJson(1.5), /浮点/);
    assert.throws(() => canonicalJson(NaN));
    assert.throws(() => canonicalJson(Infinity));
  });

  it("错误信息带出问题字段的路径", () => {
    assert.throws(() => canonicalJson({ a: { b: [new Date()] } }), /\$\.a\.b\[0\]/);
  });
});

// ────────────────────────────────────────────────────────────
describe("requirementsHash", () => {
  it("条款顺序不影响哈希", () => {
    const asc = [REQ({ id: "C1", weightBps: 5000 }), REQ({ id: "C2", weightBps: 5000 })];
    assert.equal(
      computeRequirementsHash(asc),
      computeRequirementsHash([...asc].reverse()),
    );
  });

  it("改 weightBps 会改变哈希", () => {
    const a = [REQ({ id: "C1", weightBps: 5000 }), REQ({ id: "C2", weightBps: 5000 })];
    const b = [REQ({ id: "C1", weightBps: 6000 }), REQ({ id: "C2", weightBps: 4000 })];
    assert.notEqual(computeRequirementsHash(a), computeRequirementsHash(b));
  });

  it("改 essential 会改变哈希（防事后改判）", () => {
    assert.notEqual(
      computeRequirementsHash([REQ({ essential: false })]),
      computeRequirementsHash([REQ({ essential: true })]),
    );
  });

  it("拒绝未登记字段，逼人显式决定是否进哈希", () => {
    const sneaky = { ...REQ(), extra: "x" } as unknown as Requirement;
    assert.throws(() => computeRequirementsHash([sneaky]), /未登记字段/);
  });

  it("拒绝重复 id 与空列表", () => {
    assert.throws(() => computeRequirementsHash([REQ(), REQ()]), /id 重复/);
    assert.throws(() => computeRequirementsHash([]), /为空/);
  });

  it("canonical 串带版本标识", () => {
    assert.match(canonicalizeRequirements([REQ()]), new RegExp(CANONICAL_VERSION));
  });

  it("土豆案：fixture 的哈希由条款真实算出", () => {
    assert.equal(computeRequirementsHash(POTATO_REQUIREMENTS), POTATO_REQUIREMENTS_HASH);
    assert.equal(POTATO_CASE.onchain.requirementsHash, POTATO_REQUIREMENTS_HASH);
  });

  it("土豆案：E1 条款证据的 hash 等于承诺哈希", () => {
    const e1 = POTATO_CASE.evidence.find((e) => e.kind === "requirement_hash");
    assert.ok(e1, "找不到 requirement_hash 证据");
    assert.equal(e1.hash, POTATO_REQUIREMENTS_HASH);
  });

  it("土豆案：用户提供的猫参考图与土豆交付物都有真实文件指纹", () => {
    const e1 = POTATO_CASE.evidence.find((e) => e.id === "E1");
    const e2 = POTATO_CASE.evidence.find((e) => e.id === "E2");
    assert.ok(e1 && e2?.delivery);

    assert.deepEqual(e1.asset, {
      fileName: "orange-cat-reference.png",
      mimeType: "image/png",
      sha256: "0xaad8adb7087b20935882300667a5697f9c9620ffc5903ad2aed9d013857ab60a",
      byteSize: 2_905_073,
    });
    assert.equal(e2.hash, "0x5f99d6682fb827aa0ea1d002fcbb0cd37b535c7c1a113248f66ef222abaace79");
    assert.equal(e2.delivery.byteSize, 1_704_811);
  });
});

// ────────────────────────────────────────────────────────────
describe("校验器兜住这些边界", () => {
  it("土豆案本身没有 P0/P1/P2", () => {
    assert.deepEqual(validateCase(POTATO_CASE), []);
  });

  it("条款被事后篡改 → REQUIREMENTS_HASH_MISMATCH", () => {
    const t = structuredClone(POTATO_CASE);
    t.requirements = t.requirements.map((r) =>
      r.id === "C4" ? { ...r, weightBps: 9000 } : r.id === "C1" ? { ...r, weightBps: 1000 } : r,
    );
    assert.ok(validateCase(t).some((i) => i.code === "REQUIREMENTS_HASH_MISMATCH"));
  });

  it("E3 含 Date 等不可规范化的值 → 返回 P0，而不是抛异常", () => {
    // 回归：validateCase 直接调 verifyE3PayloadHash 而不捕获异常时，
    // 反序列化回来的案件只要深层含 Date，校验器自己就崩了，
    // 调用方一条 issue 都拿不到。
    const t = structuredClone(POTATO_CASE);
    const e3 = t.evidence.find((e) => e.mossPreSign)?.mossPreSign;
    assert.ok(e3);
    (e3.simulation as { receipt: unknown }).receipt = { at: new Date() };
    const issues = validateCase(t);
    assert.ok(
      issues.some((i) => i.code === "E3_HASH_UNCOMPUTABLE"),
      issues.map((i) => i.code).join(","),
    );
  });

  it("E3 的 canonicalPayloadHash 不是字符串 → 也走 P0 而非抛错", () => {
    const t = structuredClone(POTATO_CASE);
    const e3 = t.evidence.find((e) => e.mossPreSign)?.mossPreSign;
    assert.ok(e3);
    (e3 as { canonicalPayloadHash: unknown }).canonicalPayloadHash = 42;
    assert.ok(validateCase(t).some((i) => i.code === "E3_HASH_UNCOMPUTABLE"));
  });

  it("E1 挂占位哈希 → REQUIREMENT_EVIDENCE_HASH_MISMATCH", () => {
    const t = structuredClone(POTATO_CASE);
    const e1 = t.evidence.find((e) => e.kind === "requirement_hash");
    assert.ok(e1);
    e1.hash = "0xreq0000000000000000000000000000000000000000000000000000000000001";
    const codes = validateCase(t).map((i) => i.code);
    assert.ok(codes.includes("REQUIREMENT_EVIDENCE_HASH_MISMATCH"), codes.join(","));
  });

  it("证据 hash 不是 bytes32 → EVIDENCE_HASH_INVALID", () => {
    const t = structuredClone(POTATO_CASE);
    const e2 = t.evidence.find((e) => e.id === "E2");
    assert.ok(e2);
    e2.hash = "0xdel-not-a-real-hash";
    const codes = validateCase(t).map((i) => i.code);
    assert.ok(codes.includes("EVIDENCE_HASH_INVALID"), codes.join(","));
  });
});
