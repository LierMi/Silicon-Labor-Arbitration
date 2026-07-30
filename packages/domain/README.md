# @sla/domain — 共享领域数据结构

> 三条开发线（UI / 规则引擎 / 链上集成）**共用这一套定义**。
> AGENTS.md 明确要求：不要在各自的代码里再定义一份竞争版本。

## 里面有什么

| 文件 | 内容 |
|---|---|
| `src/status.ts` | 案件状态机：8 个状态、允许的迁移、终态、中文标签 |
| `src/case.ts` | 案件数据结构：条款、证据、判定、AI 意见、责任链、结算、E3 |
| `src/validate.ts` | 一致性校验——把产品不变量写成了代码 |
| `src/fixtures/potato-case.ts` | 土豆案标准样例数据 |

## 怎么用

### Eleven（UI）

```ts
import { freshPotatoCase, CASE_STATUS_LABEL, ACTOR_ROLE_LABEL } from "@sla/domain";

const c = freshPotatoCase();           // 每次拿到全新深拷贝，可反复演示
c.responsibilityChain                   // → 责任链时间线，每跳一张卡片
c.ruleResults                           // → 裁决页逐条盖章
c.aiArguments                           // → 三栏并置的交叉质询
CASE_STATUS_LABEL[c.status]             // → "已出判定"
```

**责任链卡片的四栏**直接对应 `ChainHop` 的四个字段：

| UI 栏位 | 字段 |
|---|---|
| 谁 | `actor` / `actorRole` |
| 什么授权 | `authority` |
| 看见了什么警告 | `sawWarning`（`null` = 无警告） |
| 做了什么 | `action` |

`intentDrift` 是可选的第五项——**上一跳到这一跳意图偏移了多少**，是"责任流失"的可视化依据，建议用比正文更弱的样式呈现。

**空章位怎么判断：**

```ts
import { hasUndecidable, undecidableIds } from "@sla/domain";

hasUndecidable(c)      // → true，裁决页要出现空章位
undecidableIds(c)      // → ["C4"]，这一条的章落不下去
```

### Riso（规则引擎 / AI 层）

写入前先跑校验：

```ts
import { validateCase, assertValidCase } from "@sla/domain";

const issues = validateCase(c);         // 返回问题列表
assertValidCase(c);                     // 有 error 直接抛
```

校验会挡住这些事（都是产品不变量，不是可选项）：

- AI 意见 `cites` 为空 → `AI_NO_CITES`
- 引用了不存在的证据 → `AI_CITE_UNKNOWN`
- **主观条款被判成了 satisfied/violated** → `SUBJECTIVE_DECIDED`
- `undecidable` 没写原因 → `UNDECIDABLE_NO_REASON`
- 有不可裁决条款却没冻结资金 → `NO_FROZEN_FOR_UNDECIDABLE`
- Direct 路径证据被标成 Moss 来源 → `DIRECT_FAKED_AS_MOSS`
- 结算总额与托管金额对不上 → `SETTLEMENT_SUM`

### Neo（链上 / Moss）

`MossPreSignEvidence` 已按 `docs/08` 第 4.3、5.3 节的要求建好，包含语义映射：

```ts
semantics: {
  domainAction: "commission",
  mossCoordinate: { protocol: "silicon-arbitration", method: "createTask" },
  mossVerb: "transfer",
  semanticMappingVersion: "create-task-v1",
  semanticFidelity: "coarse-verb",
  tags: ["task-creation", "escrow", "agent-work", "arbitration"],
}
```

## 链上字段状态

Gate 3 已冻结 `TaskEscrow.createTask` / `TaskCreated`，`OnchainRefs` 现在包含 chain、合约、ABI、taskId、创建交易与确认区块字段。Moss-facing ABI hash 为：

```text
0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5
```

土豆案已写入该 ABI hash。以下字段仍保持 `"PENDING"`，因为它们分别依赖后续真实 Gate，不得伪造：

- Gate 4 Testnet 部署：`contractAddress`、`unsignedTx.to`；
- Gate 6 固定 Moss Protocol：`mossCommit`；
- Gate 8/9 真实 Moss 输出与 canonical E3：`unsignedTx.data`、`canonicalPayloadHash`。

> **UI 不要依赖 `onchain` 字段的内部组织方式。**部署前地址、交易哈希和区块号保持缺省，不使用假地址冒充链上证据。

## 校验

```bash
cd packages/domain
npx -p typescript@5.6 tsc --noEmit
```

当前状态：类型检查通过；土豆案通过全部一致性校验；8 个状态从 `Created` 全部可达。

## 铁律

**`C4` 必须保持 `undecidable`。**它是 Demo 的高潮，不是待修的 bug。
`validate.ts` 里的 `SUBJECTIVE_DECIDED` 就是用来防止有人"顺手把它判了"。
