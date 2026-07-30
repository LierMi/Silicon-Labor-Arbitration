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
  // result.provenance: { provider, model, promptVersion, inputHash, outputHash, attempts, generatedAt }
} else {
  // ⚠️ 失败不阻断资金路径：只展示规则层判定，结算照常执行
}
```

## 供应商

**默认走 Gonka**（新账号有一次性 $20 免费额度）。GonkaRouter 兼容 Anthropic Messages API，
所以 SDK 不用换，只改 baseURL + 模型 ID。

```bash
cp .env.example .env.local   # 填 GONKA_API_KEY
```

| 环境变量 | 默认值 |
|---|---|
| `GONKA_API_KEY` | 必填 |
| `GONKA_BASE_URL` | `https://api.gonkarouter.io` |
| `GONKA_MODEL` | `moonshotai/Kimi-K2.6` |

设了 `ANTHROPIC_API_KEY` 而没设 `GONKA_API_KEY` 时自动走 Anthropic。

### ⚠️ baseURL 不要写 `/v1`

SDK 会自己在 baseURL 后面拼 `/v1/messages`。写成 `https://api.gonkarouter.io/v1`
会变成 `/v1/v1/messages` 打不通。代码里做了兜底（末尾 `/v1` 自动剥掉），两种写法都能用，
但知道这件事能省一小时。

### 两家供应商的能力差异

| | Anthropic | Gonka |
|---|---|---|
| 结构化输出 `output_config.format` | ✅ 用 | ❌ 文档未提供，按不支持处理 |
| `thinking` / `effort` | ✅ 用（effort 默认 `low`） | ❌ 开源模型不认，不发送 |
| 保证 JSON 合法 | 靠 schema | 靠 prompt 约束 + 容错解析 + 重试 |

**校验器两条路径共用**——cites 非空、不得谈钱、必须标注 undecidable 是产品不变量，
跟谁家的模型无关。

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
- 输出不是合法 JSON → **重试**（Gonka 路径没有 schema 保证，重试能救回来）
- 3 次校验都不过 → 放弃

调用方拿到 `null` 时只展示规则层结果。**AI 是解释层，不是决策层——它挂了，钱照样按规则分。**

## 模型配置

**Gonka（默认）**
```ts
model: "moonshotai/Kimi-K2.6"
max_tokens: 16000
// 不发 thinking / output_config —— 开源模型不认这两个参数
```

**Anthropic（备选）**
```ts
model: "claude-opus-5"
thinking: { type: "adaptive" }
output_config: { effort: "low", format: { type: "json_schema", schema } }
max_tokens: 16000
```

`effort` 已设为 `low`——调 prompt 阶段够用，定型后再切 `high` 看最终质量。

## 溯源

每次成功生成都会返回 `provenance`，进案件证据用：

```ts
{ provider, model, promptVersion, inputHash, outputHash, attempts, generatedAt }
```

`inputHash` 是喂给模型的完整输入的 SHA-256，`outputHash` 是输出的。事后可以复算比对。
