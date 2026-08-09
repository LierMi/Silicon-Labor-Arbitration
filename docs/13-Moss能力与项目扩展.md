# Moss 能力使用与项目扩展

> 状态：Accepted
> 更新日期：2026-08-09
> 适用网络：Monad Testnet（Chain ID `10143`）

## 一、结论

本项目没有把 Moss 当作 AI 裁决器或普通交易发送器，而是把它用于任务创建交易的签名前阶段：

```text
discover → load → action → simulate
```

Moss 构造并模拟 `TaskEscrow.createTask` 的未签名交易，解析模拟产生的 Change / Receipt，并将结果交给产品侧 `MossBridge` 生成 E3 签前证据。钱包仍然是唯一的签名和广播边界。

本项目对 Moss 的扩展分为两类：

1. 团队 Moss Fork 增加 Monad Testnet Runtime，并加入项目 Protocol Package；
2. 产品仓库增加 MossBridge、E3、钱包一致性校验和语义映射证据。

当前 P0 只集成 `createTask`。后续交付、争议、结算等写操作暂时走产品的 viem / wagmi Direct 路径，不标记为 Moss verified。

## 二、我们使用的 Moss 原生能力

### 2.1 Protocol 与 Capability

项目新增并注册了：

```text
protocol: silicon-arbitration
method: createTask
```

该 Capability 为 `TaskEscrow.createTask` 定义参数契约：

| 参数 | 作用 |
|---|---|
| `amount` | 用户锁定的 MON 数量 |
| `requirementsHash` | 规范化需求条款的哈希 |
| `deadline` | 任务截止时间 |

Capability 负责根据参数构造 payable 的未签名合约交易，包含：

```solidity
createTask(bytes32 requirementsHash, uint256 deadline)
```

相关实现：

- `vendor/moss/packages/protocols/silicon-arbitration/src/adapter.ts`
- `vendor/moss/packages/protocols/silicon-arbitration/src/abis/taskEscrow.ts`

### 2.2 Registry 的 discover / load / action

产品通过 Moss Registry 定位并调用 Capability：

```text
Registry.use(silicon-arbitration)
  → Registry.load(...)
  → Registry.action("silicon-arbitration", "createTask", ...)
```

`load` 提供签名前需要展示的结构化语义：

- intent；
- 参数契约；
- verb；
- category；
- risk；
- tags。

`action` 返回 Moss 构造的 Capability 和未签名交易。产品调用方不自行重新 encode `createTask`。

### 2.3 Capability Tree 与 TransactionNode

Moss 将 Capability 展开为交易节点，产品从模拟结果中读取最终交易字段：

```text
Capability
  → TransactionNode
  → to
  → data
  → value
  → from
```

这些字段被直接交给钱包层，形成：

```text
Moss 构造
  → Moss 模拟
  → 用户查看
  → 钱包签名同一笔交易
```

### 2.4 Simulator 与 `debug_traceCall`

项目使用 Moss Simulator 在 Monad Testnet 执行真实 `createTask` 模拟。Simulator 通过 RPC 的 `debug_traceCall` 获取：

- 调用轨迹；
- 事件日志；
- native MON 转账；
- 有序 Change；
- Gas 估算；
- Revert 状态；
- Warning。

已验证的 live 路径为：

```text
Monad Testnet
  → 已部署 TaskEscrow
  → createTask Capability
  → action
  → simulate
  → 完整 Change / Receipt
  → Warnings = 0
  → Reverted = false
```

对应测试：

- `vendor/moss/packages/protocols/silicon-arbitration/test/live.test.ts`
- `vendor/moss/packages/protocols/silicon-arbitration/test/adapter.test.ts`

### 2.5 Change 与 Receipt Parser

项目实现了 `TaskCreated` Receipt Parser，识别两类 Change：

1. `nativeTransfer`：解释为用户向 TaskEscrow 锁定 MON；
2. `TaskCreated` Event：解析 `taskId`、`client`、`amount`、`reqHash` 和 `deadline`。

Receipt Parser 返回结构化结果，并保留原始 Change 的顺序和身份。它采用 fail-closed 规则：

- 缺少 `TaskCreated` Event 时失败；
- 遇到未知 Event 时失败；
- 出现重复或无法覆盖的 Change 时失败；
- 不根据计划交易臆造模拟结果。

### 2.6 Moss Metadata 与 MCP 注册

Capability 使用 Moss 当前闭集中的：

```text
verb: transfer
category: token
risk: fundOut
```

并携带：

```text
tags:
  task-creation
  escrow
  agent-work
  arbitration
```

`silicon-arbitration` 已加入 Moss MCP composition，因此 Moss MCP catalog 可以发现该 Protocol。产品浏览器不直接启动 Moss MCP stdio，产品调用由服务端 `MossBridge` 完成。

相关文件：

- `vendor/moss/packages/mcp-server/src/composition.ts`
- `vendor/moss/packages/mcp-server/src/server.ts`

## 三、我们对 Moss 的扩展

### 3.1 增加 Monad Testnet Runtime

官方 Moss 默认面向 Monad Mainnet（Chain ID `143`）。本项目只使用 Monad Testnet（Chain ID `10143`），因此团队 Fork 增加了独立的：

```typescript
monadTestnetRuntime()
```

该 Runtime：

- 默认使用 `https://testnet-rpc.monad.xyz`；
- 连接后验证实际 chain ID 为 `10143`；
- 保留 Mainnet Runtime 和 Mainnet 常量；
- 不把 Mainnet 地址重新解释为 Testnet 地址；
- 通过 deployment network guard 拒绝网络不匹配的固定地址 Protocol。

相关文件：

- `vendor/moss/packages/system/src/runtime.ts`
- `vendor/moss/packages/system/src/index.ts`
- `vendor/moss/docs/adr/0013-explicit-monad-network-runtime.md`

### 3.2 新增 `silicon-arbitration` Protocol Package

团队 Moss Fork 新增：

```text
@themoss/protocol-silicon-arbitration
```

首版范围只有一个 Capability：

```text
silicon-arbitration.createTask
```

Package 包含：

- Moss-facing ABI；
- Monad Testnet TaskEscrow 地址；
- `createTask` 参数 Schema；
- MON 金额转换；
- `requirementsHash` 的 bigint / bytes32 边界转换；
- `TaskCreated` Receipt Parser；
- offline transaction-shape test；
- Receipt coverage test；
- Monad Testnet live simulation；
- MCP composition 注册。

### 3.3 冻结最小 ABI 和部署事实

Moss 只接入合约所需的最小 ABI：

```solidity
function createTask(
    bytes32 requirementsHash,
    uint256 deadline
) payable returns (bytes32 taskId)

event TaskCreated(
    bytes32 indexed taskId,
    address indexed client,
    uint256 amount,
    bytes32 reqHash,
    uint256 deadline
)
```

当前部署事实：

| 项目 | 值 |
|---|---|
| Network | Monad Testnet |
| Chain ID | `10143` |
| TaskEscrow | `0x67040374b8A9756586De0885f01d1291cE8FFCcF` |
| ABI hash | `0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5` |
| Moss commit | `b00ed2db0454219e468e8a0e4928c364a869fb79` |

ABI 和部署信息记录在：

- `vendor/moss/packages/protocols/silicon-arbitration/src/abis/taskEscrow.ts`
- `deployments/monad-testnet.json`
- `moss.lock.json`

### 3.4 对闭集语义进行显式、有限的适配

Moss 当前的 `transfer` 不能完整表达产品领域动作 `commission`。本项目没有为了一个 Capability 向 Moss Core 全局增加完整仲裁生命周期词表，而是采用粗粒度映射，并明确记录语义损失：

```json
{
  "domainAction": "commission",
  "mossCoordinate": {
    "protocol": "silicon-arbitration",
    "method": "createTask"
  },
  "mossVerb": "transfer",
  "semanticMappingVersion": "create-task-v1",
  "semanticFidelity": "coarse-verb"
}
```

因此：

- `transfer` 只表示资金进入托管合约的粗粒度交易类别；
- 精确业务语义由 Protocol、method、intent、params 和 tags 提供；
- UI 不得只展示 `Transfer`；
- Demo 不得声称 Moss 原生拥有 `commission` Verb。

### 3.5 产品侧增加 MossBridge

产品将 Moss 内部复杂度收口到：

```text
packages/moss-bridge
```

核心链路：

```text
prepareCreateTask
  → Registry.action
  → unsignedTransaction
  → Simulator.simulate
  → Receipt / Warning 校验
  → E3
```

MossBridge 负责：

- 初始化 Testnet Runtime；
- 注册项目 Protocol；
- 获取 Capability metadata；
- 提取未签名交易；
- 运行模拟；
- 归一化 Revert / Warning；
- 生成 RPC 指纹；
- 生成产品侧 E3。

UI、规则引擎和 AI 解释层不直接依赖 Moss Registry、Decorator、Receipt internals 或 MCP transport。

对应文件：

- `packages/moss-bridge/src/index.ts`

### 3.6 产品侧增加 E3 签前证据

Moss 提供模拟结果，产品进一步将结果固化为 E3。E3 至少绑定：

- 用户实际看到的 explanation；
- chain ID；
- RPC fingerprint；
- Moss repository / commit；
- Protocol version；
- contract address；
- ABI hash；
- 实际传给 Moss 的 Capability 参数；
- Moss 生成的 unsigned transaction；
- simulation Receipt；
- Warning；
- domainAction 与 Moss verb 的映射；
- canonical payload hash；
- wallet consistency 结果。

E3 使用产品侧 canonical serialization 和 hash，确保案件中保存的内容就是参与哈希的内容，而不是调用方另行拼出的副本。

相关实现：

- `packages/domain/src/canonical.ts`
- `packages/moss-bridge/src/index.ts`
- `packages/moss-bridge/src/e3.test.ts`

### 3.7 产品侧增加 Wallet Consistency Gate

Moss 构造的交易和钱包最终签名的交易必须逐字段一致：

```text
to
data
value
from
chainId
```

产品会：

1. 在签名前为 Moss unsigned transaction 计算 fingerprint；
2. 将同一交易交给钱包；
3. 在广播后回读实际交易；
4. 逐字段比较；
5. 不一致时标记失败，不把它归档为有效 Moss 证据。

这是产品侧的安全扩展，不代表 Moss 会代替钱包签名或广播。

### 3.8 产品侧增加真实来源溯源和 RPC 脱敏

E3 的 Moss commit 和 Protocol version 从实际锁定文件和 Protocol Package 读取，不由调用方手写默认值。

RPC 只保存脱敏指纹：

- 删除 userinfo；
- 删除 query 参数；
- 替换疑似密钥的长路径段；
- 保留服务商 host 和必要的路径结构。

这样既能证明模拟环境，又不会把 RPC key 写入证据。

## 四、明确没有使用 Moss 做什么

### 4.1 Moss 不签名、不广播

```text
Moss：构造、模拟、解释
Wallet：签名、广播
Chain：确认并产生真实回执
```

Moss 不持有私钥，不替用户批准交易。

### 4.2 Moss 不参与业务裁决

Moss 不判断：

- 交付物是否为猫；
- 谁承担责任；
- 是否构成违约；
- 是否应该仲裁；
- 是否应接受主观证据；
- 最终如何分配责任。

这些属于项目的规则引擎、AI 解释、人工复核和领域模型。C4 主观条件仍保持 `undecidable`。

### 4.3 后续生命周期暂未接入 Moss

以下操作当前使用产品的 viem / wagmi Direct 路径：

```text
submitDelivery
acceptDelivery
openDispute
submitEvidence
proposeRuling
requestAppeal
settle
releaseFrozen
```

边界是：

```text
createTask
  → Moss 构造 + Moss 模拟 + E3

后续操作
  → Direct contract interaction + 钱包签名 + 链上回执
```

Direct 路径的普通交易证据可以保存，但不能标记为：

```text
Moss verified
Moss simulation Receipt
canonical Moss E3
```

## 五、双仓库和版本固定

项目采用：

```text
产品仓库
  └── vendor/moss（Git submodule，固定 commit）

团队 Moss Fork
  ├── Monad Testnet Runtime
  └── silicon-arbitration Protocol Package

官方 Moss
  └── 只作为 upstream，不直接承载项目业务代码
```

当前产品通过 `moss.lock.json` 固定：

```text
repository: https://github.com/LierMi/moss.git
commit: b00ed2db0454219e468e8a0e4928c364a869fb79
```

不复制 Moss 源码到产品目录，不合并两个 Git 历史。

## 六、当前状态和剩余边界

已完成：

- Monad Testnet Runtime 与 deployment network guard；
- `silicon-arbitration` Protocol Package；
- `createTask` Capability；
- `TaskCreated` Receipt Parser；
- offline tests；
- Testnet live simulation；
- 产品 MossBridge；
- E3 canonical hash；
- 钱包一致性 fingerprint gate。

尚未完成：

- Demo 案件的真实钱包签名、广播和链上回执回填；
- 现场三分钟端到端演练。

因此准确表述是：

> Moss Testnet 集成已完成，并已通过真实 `createTask` live simulation 验证；在真实钱包广播路径完成前，不宣称完整端到端已上线。

## 七、相关事实源

- [Moss 边界与职责划分](./08-Moss边界与职责划分.md)
- [双仓库架构与 Moss Testnet 集成](./05-双仓库架构与Moss-Testnet集成.md)
- [技术风险与决策清单](./06-技术风险与决策清单.md)
- [Moss 改动与 PR 合并说明](./09-给RISO的Moss改动与PR合并说明.md)
- [`MossBridge`](../packages/moss-bridge/src/index.ts)
- [`silicon-arbitration` Adapter](../vendor/moss/packages/protocols/silicon-arbitration/src/adapter.ts)
- [`moss.lock.json`](../moss.lock.json)
