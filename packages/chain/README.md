# @sla/chain — 链配置、ABI、交易构造与 wagmi hooks

> **Direct 路径专用。**`createTask` 的 P0 主路径走 `@sla/moss-bridge`，不走这里。

## 分两层

| | |
|---|---|
| `tx.ts` | **纯函数**，构造交易参数。不依赖 React，可单测 |
| `hooks.ts` | wagmi hooks，只是上一层的薄包装 |

这样拆是为了**不起 React 就能验证参数对不对**。

## 用法

```ts
import { useAcceptDelivery, useOpenDispute, useReleaseFrozen } from "@sla/chain/hooks";

const { send, isPending } = useAcceptDelivery();
await send(taskId);
```

不用 React 时直接用构造层：

```ts
import { buildSettle } from "@sla/chain";
const req = buildSettle(caseId, c.settlementProposal!, proposalHash);
```

## 合约地址

```
0x67040374b8A9756586De0885f01d1291cE8FFCcF   Monad Testnet (10143)
```

已在链上核验：6021 字节运行时代码、sha256 一致、部署交易区块 49534792。

## 三条写进代码的约束

### 1. deadline 必须运行时计算

`buildCreateTaskDirect()` 内部调 `deadlineFromNow()` + `assertUsableDeadline()`，
**不接受外部传入固定日期**。杜绝两件事：过期 revert、重复演示撞 `taskId`。

### 2. 非法参数在发交易前就拦下

合约那些不透明的 revert，提前变成本地说人话的错误：

| 拦下 | 对应合约错误 |
|---|---|
| 金额为 0 | `ZeroEscrowAmount` |
| `requirementsHash` 为空 | `EmptyRequirementsHash` |
| Agent 零地址 | `InvalidAgent` |
| `deliveryHash` 为空 | `EmptyDeliveryHash` |
| 结算/复核哈希为空 | `EmptySettlementProposalHash` / `EmptyReviewDecisionHash` |

### 3. Direct 证据来源写死为 `"direct"`

`buildDirectTxEvidence()` 的 `source` 是硬编码的，**没有参数能改它**——
"把 Direct 交易标成 Moss 证据"这件事在类型层面就做不到。
（domain 校验器里这是 P0：`DIRECT_FAKED_AS_MOSS`）

## ⚠️ 两套状态机不是一一对应的

```
合约有、domain 没有：  Refunded          过期退款，是链上事实
domain 有、合约没有：  RulingProposed    规则层出了判定，还没上链结算
                     Appealed          申诉，目前只在链下流转
```

合约只关心钱在谁手里；domain 还要表达"判定到哪一步了"。

所以 `toCaseStatus()` / `toContractStatus()` 是**部分函数**，映不上时返回 `null`，
调用方应保留现有状态，**不要猜**。

> 实际含义：规则层出了判定但还没结算时，链上仍然停在 `Disputed`。
> 界面上「已出判定」这个状态是链下的，链上查不到。

## 已验证

```
tsc --noEmit（含 hooks，react 19 + wagmi 3 实装）  通过
deadline 在未来 +3600s，value 精确 0.2 MON          ✅
六种非法参数全部在本地拦下                            ✅
Direct 证据 source 写死，推进案件后 domain 校验通过    ✅
结算金额 0.15/0/0.05 合计精确 0.2                    ✅
状态映射：映不上的四种情况全部返回 null                ✅
```
