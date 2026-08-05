/**
 * 规范化序列化（canonical serialization）
 *
 * ## 为什么需要这个文件
 *
 * `requirementsHash` 要把验收条款**承诺**上链。但 keccak256 吃的是字节，
 * 不是对象——所以必须先把对象变成字节。而同一份数据可以写成很多种字节：
 *
 * ```
 * {"id":"C1","weightBps":2500}      键的顺序不同
 * {"weightBps":2500,"id":"C1"}
 * {"id": "C1", "weightBps": 2500}   空格不同
 * [C1,C2,C3,C4] / [C4,C3,C2,C1]     数组顺序不同
 * ```
 *
 * 意思一样，字节不同，哈希不同。**承诺就失效了。**
 *
 * 所以这里钉死唯一一种写法：键按 UTF-16 码元升序、不留空格、条款按 id 升序、
 * 字段清单固定。任何人在任何时候、用任何语言，对同一份条款都能算出
 * 逐字节相同的输出。
 *
 * 参考 RFC 8785 (JCS) 的核心约定，但不追求完全等价——我们的取值范围窄得多
 * （不出现浮点、不出现 Date、不出现 BigInt），把这些直接拒掉比实现全套更安全。
 *
 * ## ⚠️ 一个反直觉的坑
 *
 * `JSON.stringify(obj, Object.keys(obj).sort())` **不是**排序器。
 * 第二个参数传数组时，它是一个**作用于所有层级的字段白名单**：
 *
 * ```
 * 输入  { b: 1, a: { nested: 2, other: 3 } }
 * 输出  {"a":{},"b":1}          ← 嵌套对象被清空
 * ```
 *
 * 顶层键名恰好不在嵌套层出现，嵌套内容就整个消失。用它算哈希，
 * 两份完全不同的数据会算出同一个值。**用本文件的 `canonicalJson` 代替它。**
 */

import { keccak256, toHex } from "viem";
import type { Requirement } from "./case.js";

/** canonical 格式版本。字段清单或排序规则一旦变动，必须同步 +1。 */
export const CANONICAL_VERSION = "req-canon-v1";

/**
 * 进入 `requirementsHash` 的字段清单。**顺序即序列化顺序。**
 *
 * 用显式清单而不是"对象里有什么就序列化什么"，是为了让"承诺了什么"
 * 与代码演进解耦。但光有清单不够——见下面的 `assertNoUnknownKeys`。
 */
const COMMITTED_FIELDS = [
  "check",
  "essential",
  "expect",
  "id",
  "label",
  "type",
  "weightBps",
] as const satisfies readonly (keyof Requirement)[];

/**
 * 拒绝未知字段。
 *
 * 光有白名单会留下一个静默陷阱：将来有人给 Requirement 加了个有语义的字段，
 * 它不在清单里，于是**没被承诺**，但谁都不会发现。
 *
 * 所以这里反过来卡一道：出现清单外的字段就直接报错，
 * 逼加字段的人显式决定"它要不要进哈希"，并顺手升 CANONICAL_VERSION。
 */
function assertNoUnknownKeys(r: Requirement): void {
  const known = new Set<string>(COMMITTED_FIELDS);
  const unknown = Object.keys(r).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    throw new Error(
      `条款 ${r.id} 含未登记字段：${unknown.join(", ")}。` +
        `请在 canonical.ts 的 COMMITTED_FIELDS 中显式决定它是否进 requirementsHash，` +
        `并同步升级 CANONICAL_VERSION（当前 ${CANONICAL_VERSION}）。`,
    );
  }
}

/**
 * 判断是否为**朴素对象**（字面量或 `JSON.parse` 出来的）。
 *
 * ⚠️ 这道检查是补上的一个真实碰撞路径。原先只判 `typeof === "object"`，
 * 于是 `Date` / `Map` / `Set` / 类实例走进对象分支，而它们的
 * `Object.keys()` 都是空数组，于是全部序列化成 `{}`：
 *
 * ```
 * canonicalJson(new Date())  →  "{}"
 * canonicalJson(new Map())   →  "{}"
 * canonicalJson(new Set())   →  "{}"
 * canonicalJson({})          →  "{}"     ← 四者哈希相同
 * ```
 *
 * 对一个"承诺"用的哈希来说，这等于给了一条无声的伪造通道。
 */
function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * 递归规范化任意值。
 *
 * 只接受可确定性序列化的类型：null / boolean / 整数 / 字符串 / 数组 /
 * 朴素对象。其余（undefined、函数、symbol、BigInt、Date、Map、Set、
 * RegExp、类实例、浮点数、NaN、Infinity）**一律抛错**。
 *
 * 宁可报错也不猜——**承诺环节里，静默的转换就是静默的伪造**。
 */
export function canonicalJson(value: unknown, path = "$"): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";

    case "number":
      if (!Number.isFinite(value)) {
        throw new Error(`${path} 是 ${value}，无法确定性序列化`);
      }
      if (!Number.isInteger(value)) {
        // 浮点数的十进制表示在不同语言/平台间不保证一致，直接拒绝。
        // 金额一律用整数 wei 或基点，本来也不该出现浮点。
        throw new Error(`${path} 是浮点数 ${value}，canonical 只接受整数`);
      }
      return String(value);

    case "string":
      // JSON.stringify 对字符串的转义规则是确定的（UTF-8 原样输出，
      // 只转义控制字符和 " \），中文标签不会被拆成 \uXXXX
      return JSON.stringify(value);

    case "object": {
      if (Array.isArray(value)) {
        // ⚠️ 数组**保持原顺序**——数组的顺序通常是有语义的。
        // 需要顺序无关的地方（如条款列表），由调用方先排好再传进来。
        return `[${value.map((v, i) => canonicalJson(v, `${path}[${i}]`)).join(",")}]`;
      }
      if (!isPlainObject(value)) {
        const name = value.constructor?.name ?? "未知类型";
        throw new Error(
          `${path} 是 ${name} 实例，不是朴素对象。canonical 拒绝它——` +
            `Date / Map / Set / 类实例的 Object.keys() 都是空的，` +
            `会被静默序列化成 {} 而与空对象碰撞。请先显式转成朴素结构` +
            `（如 Date 转 ISO 字符串、Map 转对象、Set 转数组）。`,
        );
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const parts = keys.map((k) => {
        const v = obj[k];
        if (v === undefined) {
          throw new Error(`${path}.${k} 是 undefined，canonical 不接受（请显式写 null）`);
        }
        return `${JSON.stringify(k)}:${canonicalJson(v, `${path}.${k}`)}`;
      });
      return `{${parts.join(",")}}`;
    }

    default:
      // undefined / function / symbol / bigint
      throw new Error(`${path} 的类型 ${typeof value} 无法确定性序列化`);
  }
}

/**
 * 把条款列表规范化成唯一确定的字符串。
 *
 * 输出形如：
 * ```
 * {"requirements":[…],"version":"req-canon-v1"}
 * ```
 * 带上 version 是为了让哈希自带格式标识：将来规则变了，
 * 旧哈希不会被误当成新格式复算。
 */
export function canonicalizeRequirements(requirements: readonly Requirement[]): string {
  if (requirements.length === 0) {
    throw new Error("条款列表为空，无法生成 requirementsHash");
  }

  const ids = requirements.map((r) => r.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    throw new Error(`条款 id 重复：${[...new Set(dupes)].join(", ")}`);
  }

  // 条款按 id 升序，使"传进来的顺序"不影响哈希
  const sorted = [...requirements].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const normalized = sorted.map((r) => {
    assertNoUnknownKeys(r);

    if (typeof r.weightBps !== "number") {
      throw new Error(`条款 ${r.id} 缺少 weightBps —— 权重必须被承诺`);
    }
    if (typeof r.essential !== "boolean") {
      throw new Error(`条款 ${r.id} 缺少 essential —— 是否可分给付必须被承诺`);
    }

    const out: Record<string, unknown> = {};
    for (const f of COMMITTED_FIELDS) out[f] = r[f];
    return out;
  });

  return canonicalJson({ version: CANONICAL_VERSION, requirements: normalized });
}

/**
 * 计算 `requirementsHash`，即 `createTask` 的第一个参数。
 *
 * 第三方复算方式：拿到条款原文 → 跑这个函数 → 比对链上 `createTask` 的入参。
 * 对不上就说明条款被事后改过。**这是"0.05 可复算"这一主张的技术支点。**
 */
export function computeRequirementsHash(requirements: readonly Requirement[]): `0x${string}` {
  return keccak256(toHex(canonicalizeRequirements(requirements)));
}

// ────────────────────────────────────────────────────────────
// E3（Moss 签前证据）的规范化哈希
// ────────────────────────────────────────────────────────────

/**
 * 计算 E3 的 `canonicalPayloadHash`。
 *
 * ⚠️ **哈希必须覆盖「案件里真正存着的那份 E3」**，而不是生成它的中间对象。
 * 否则第三方拿到案件档案后复算不出同一个值——那这个字段就只是装饰。
 *
 * 所以入参是 `MossPreSignEvidence` 去掉 `canonicalPayloadHash` 本身
 * （自己不能包含自己的哈希），其余字段**原样**参与计算。
 */
export function computeE3PayloadHash(e3: object): `0x${string}` {
  const { canonicalPayloadHash: _drop, ...rest } = e3 as Record<string, unknown>;
  return keccak256(toHex(canonicalJson(rest)));
}

/**
 * 校验一份 E3 的 `canonicalPayloadHash` 是否与内容相符。
 *
 * 入参故意写成 `object & { canonicalPayloadHash: string }` 而不是带索引签名的
 * 形状：TypeScript 的 interface **不满足索引签名**，那样写会让
 * `MossPreSignEvidence` 传不进来，逼调用方到处写 `as unknown as …`。
 */
export function verifyE3PayloadHash(
  e3: object & { canonicalPayloadHash: string },
): { ok: boolean; expected: string } {
  const expected = computeE3PayloadHash(e3);
  return { ok: e3.canonicalPayloadHash.toLowerCase() === expected.toLowerCase(), expected };
}
