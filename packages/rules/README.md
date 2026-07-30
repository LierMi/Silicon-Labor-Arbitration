# @sla/rules — 确定性规则引擎

> 规则引擎**不是另一个 AI**。它只读结构化输入，用可重放的纯函数计算，
> 任何人拿同一份证据都能算出同一个结果。

## 三条不可违背的规则

1. **主观条款永远是 `undecidable`** —— 不管有没有登记检查器，不管 AI 怎么说
2. **金额由事前承诺的 `weightBps` 算出**，不是在这里选出来的
3. **全程整数运算**（wei 级 bigint），绝不用浮点

## 用法

```ts
import { runRules, applyRules } from "@sla/rules";

const run = runRules(c);
run.ruleResults      // 每条条款的判定
run.settlement       // { toAgent, toClient, frozen }
run.weightBreakdown  // { satisfiedBps, violatedBps, undecidableBps } ← 回答"0.05 怎么来的"
run.details          // UI 可显示的判定依据

const next = applyRules(c);   // 写回案件，返回新对象
```

## 金额是怎么算出来的

每条验收条件在 `createTask` **之前**就有权重（单位基点，总和 10000），
并随 canonical requirements 被 `requirementsHash` 承诺上链。

```
C1 2500 ✅ ┐
C2 2500 ✅ ├─ 7500 bps → 0.2 × 75% = 0.15  可支付
C3 2500 ✅ ┘
C4 2500 ⬜ ─── 2500 bps → 0.2 × 25% = 0.05  冻结
```

**0.05 不是选出来的，是算出来的。**评委问"为什么是这个数"，答案是
"四条标准在任务开始前各占 25%，写进了链上承诺的哈希里"。

整数除法的余数（尘埃）一律归入 `frozen`——**拿不准的钱留住，不发出去**。

## 已验证

```
土豆案                      C1/C2/C3 satisfied，C4 undecidable
                            → 0.15 / 0 / 0.05，合计 0.2 ✅
权重改成 10/20/20/50        → 0.1 / 0 / 0.1，合计 0.2 ✅  金额随权重变，非写死
迟交 1 小时                 → C1 violated，0.1 / 0.05 / 0.05 ✅
交 JPG 且无透明             → C2/C3 violated，0.05 / 0.1 / 0.05 ✅
权重 3333/3333/3333/1       → 余数进 frozen，合计仍为 0.1 ✅
给 C4 换上客观检查器        → C4 仍是 undecidable ✅
权重之和 ≠ 10000            → 直接抛错 ✅
```

## 检查器

| check | 依据 | 注意 |
|---|---|---|
| `delivered_before_deadline` | `submittedAt` vs deadline | 时间必须来自链上 block timestamp，**不能用客户端时钟** |
| `file_format` | 字节解析出的 `mimeType` | **不看文件扩展名**，扩展名可以随便改 |
| `has_alpha` | PNG alpha 通道 | |

没有登记的 check 名一律 `undecidable`，**不猜**。
