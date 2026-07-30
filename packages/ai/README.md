# @sla/ai — AI 三路意见

> **AI 只解释证据，不决定钱。**
> 金额由 `@sla/rules` 按事前承诺的 `weightBps` 算出，AI 连看都看不到。

## 三个角色

| 角色 | 立场 |
|---|---|
| `prosecution` 检方 | 指出交付与约定之间的偏离 |
| `defense` 辩方 | 指出已满足的条件，以及约定本身的不明确之处 |
| `audit` 审计 | 不站边：核对流程完整性、双方是否知情、哪些事实缺依据 |

## 用法

```ts
import { generateArguments } from "@sla/ai";

const result = await generateArguments(caseObj);

if (result) {
  caseObj.aiArguments = result.arguments;
  // result.provenance: { model, promptVersion, inputHash, outputHash, attempts, generatedAt }
} else {
  // ⚠️ 失败不阻断资金路径：只展示规则层判定，结算照常执行
}
```

需要 `ANTHROPIC_API_KEY`，或 `ant auth login` 之后的本地 profile。

## 为什么 AI 不可能输出金额

不是靠事后检查，是靠**结构上没有那个字段**：

```ts
// schema.ts —— 输出 schema 里只有这四项
{ role, text, cites, uncertain }
```

传给模型的输入也做了裁剪，**刻意剔除**：

- `settlementProposal` —— 金额
- `requirement.weightBps` —— 权重（看见权重等于看见钱）

模型看不到钱，就无从对钱发表意见。正文里的金额正则只是最后一道兜底。

## 校验（Neo 文档 §4.5 的硬约束，已写成代码）

生成后立即校验，不合格**带着拒绝理由回灌重试**，最多 3 次：

| 代码 | 拦住什么 |
|---|---|
| `EMPTY_CITES` | 意见没有引用任何证据 |
| `UNKNOWN_CITE` | 引用了不存在的证据编号 |
| `MISSING_UNDECIDABLE` | 没把 `undecidable` 条款标进 `uncertain`（AI 不能替规则层判了） |
| `UNKNOWN_UNCERTAIN` | 标注了不存在的条款 |
| `AMOUNT_IN_TEXT` | 正文出现金额或比例 |
| `MISSING_ROLE` / `DUPLICATE_ROLE` | 三个角色不齐或重复 |

已验证：8 个反例全部被拦下（合格样本通过；空引用、假证据编号、漏标 C4、假条款号、`0.15 MON`、`75%`、缺角色、角色重复各自命中对应代码）。

## 失败处理

任何一种失败都返回 `null`，**不抛异常、不阻断资金路径**：

- 网络 / 额度 / 服务错误 → 不重试，直接放弃
- `stop_reason === "refusal"` → 停止重试
- 输出不是合法 JSON → 放弃
- 3 次校验都不过 → 放弃

调用方拿到 `null` 时只展示规则层结果。**AI 是解释层，不是决策层——它挂了，钱照样按规则分。**

## 模型配置

```ts
model: "claude-opus-5"
thinking: { type: "adaptive" }        // 需要推理：读证据、分立场、核对编号
output_config: { format: { type: "json_schema", schema } }   // 结构化输出，不用 prefill
max_tokens: 16000
```

`effort` 是成本旋钮，默认 `high`。演示要反复跑的话可以降到 `medium`。

## 溯源

每次成功生成都会返回 `provenance`，进案件证据用：

```ts
{ model, promptVersion, inputHash, outputHash, attempts, generatedAt }
```

`inputHash` 是喂给模型的完整输入的 SHA-256，`outputHash` 是输出的。事后可以复算比对。
