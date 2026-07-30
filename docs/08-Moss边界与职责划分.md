# Moss 边界与职责划分：P0 只集成 createTask

> 状态：Accepted
> 日期：2026-07-30
> 决策：黑客松 P0 只将 `TaskEscrow.createTask` 接入 Moss；后续生命周期操作暂用 viem/wagmi 直接调用。
> 审读基线：`nishuzumi/moss@2e7c1dbeb5e6f3b1492455034e3b0348a3c0094d`，并结合团队 Fork 的 Monad Testnet Runtime PR。

## 一、先纠正一个容易混淆的概念

Moss 的职责是：

```text
discover → load → action → simulate
```

它构造和模拟未签名交易，不签名、不广播、不保存私钥，也不负责业务裁决。

`submitDelivery`、`openDispute`、`settle` 等后续生命周期操作同样各自需要钱包签名，因此 Moss **技术上可以**在它们各自签名前构造和模拟交易。把它们排除在 P0 之外，不是因为 Moss “不能处理签名后的操作”，而是产品范围和投入产出选择：

> 黑客松阶段只把 Moss 用在增量价值最高、资金风险最大、最能形成 E3 的 `createTask`；不是把 Moss 扩张为整套业务 API Gateway。

这个区分避免两种错误：

- 错误地宣称 Moss 只能处理业务流程的第一笔交易；
- 为证明“深度集成”而把每个简单状态推进都包装成 Moss Capability。

## 二、Moss 的真实能力边界

本次结论来自对 `core/runtime`、`types`、`decorators`、`registry`、`framework`、`handle`、`simulator`、`mcp-server`，以及 PancakeSwap、ERC、Protocol Template 参考实现的逐文件审读。

Moss 的核心链路：

1. `discover`：按 Protocol、Verb、Category 找到 Capability / Query coordinate；
2. `load`：读取 intent、参数契约、risk 和 tags；
3. `action`：由 Protocol Adapter 构造 Capability Tree 和未签名交易；
4. `simulate`：通过目标网络的 `debug_traceCall` 模拟，提取 Change，由 Receipt parser 生成结构化解释；
5. 钱包：在 Moss 之外完成签名和广播。

因此 Moss 适合以下操作：

- 资金流或授权风险明显；
- 参数复杂，需要签名前解释；
- 模拟结果会影响用户是否继续；
- 需要把签前证据固定为 E3；
- 操作具有可复用的 Protocol 语义和 Receipt parser。

Moss 不要求所有合约写操作都必须经过它。简单、低风险、价值有限的状态推进可以由产品直接调用合约，只要产品不把它们宣传成 Moss 构造或 Moss 模拟的操作。

## 三、为什么 P0 只选择 createTask

`TaskEscrow.createTask` 同时承担：

- 创建任务；
- 绑定结构化需求 hash；
- 设置 deadline；
- 锁定用户资金；
- 生成 `taskId`；
- 发出 `TaskCreated` Event；
- 建立后续交付、争议和结算的事实根。

签名前用户真正需要确认：

```text
在哪条链？
调用哪个合约？
锁定多少 MON？
需求 hash 是什么？
deadline 是什么？
模拟是否出现预期 TaskCreated？
是否存在未解释的 Change 或 Warning？
钱包最终请求是否和模拟交易完全一致？
```

这些问题正好对应 Moss 的优势。`createTask` 还是 E3 的起点：后续责任链必须能够回到创建任务时的签前解释、Capability、模拟 Receipt 和最终交易回执。

## 四、为什么后续操作暂不进入 Moss

P0 暂不为以下操作开发 Moss Capability：

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

原因不是这些操作永远不值得模拟，而是：

1. 黑客松时间有限，完整生命周期会引入多个 Adapter、Receipt parser、offline fixture 和 live simulation；
2. 多数操作首先是角色受限的状态推进，P0 的核心验证点仍是合约权限和状态机；
3. 当前合约 ABI、Event 和 Testnet 地址尚未冻结，过早扩展 Protocol 会放大返工；
4. 只有 `createTask` 是当前明确要求形成 canonical Moss E3 的资金入口；
5. Moss Core 的全局词表不应在没有第二个真实 Protocol 需求前加入 8 个项目专用动词。

这些后续操作由 viem/wagmi 直接构造钱包请求。产品必须明确标注：

```text
createTask：Moss 构造 + Moss 模拟 + E3
后续操作：产品直接合约调用 + 钱包确认 + 链上回执
```

直接调用路径仍要保存：

- chain ID；
- contract / function；
- 参数摘要；
- transaction hash；
- receipt status / block；
- 关键 Event；
- 发起角色。

但这些证据不能标成 Moss simulation Receipt 或 canonical Moss E3。

## 五、createTask 的 Verb / Category 决策

### 5.1 P0 不扩展 Moss Core 全局词表

当前不增加：

```text
commission, deliver, accept, dispute,
submit-evidence, rule, appeal, settle

agent-work, arbitration

escrowLock, stateCommitment,
evidenceCommitment, fundAllocation
```

原因：

- 这些词会改变所有 Moss 客户端看到的全局 MCP schema；
- 目前只有一个项目和一个 P0 Capability 需要它们；
- 真实 Protocol 尚未运行，缺乏第二个用例验证词汇粒度；
- Runtime PR 应保持聚焦于网络身份和 deployment safety。

### 5.2 createTask 暂用现有 `transfer` + 精确 intent / tags

P0 Adapter 计划使用：

```typescript
@Protocol({
  name: "silicon-arbitration",
  category: "token",
  description: "Create funded Agent-work escrow tasks on Monad Testnet",
  contracts: {
    taskEscrow: {
      abi: TaskEscrowAbi,
      addr: TASK_ESCROW_TESTNET_ADDRESS,
    },
  },
})
class SiliconArbitration {
  @Capability({
    intent: "Create an Agent-work task and lock {amount} MON in escrow until acceptance or settlement",
    verb: "transfer",
    params: createTaskParams,
    receipt: "createTaskReceipt",
    risk: ["fundOut"],
    tags: ["task-creation", "escrow", "agent-work", "arbitration"],
  })
  async createTask(params, context) {
    // 由 Moss Handle 构造 TaskEscrow.createTask 未签名交易
  }
}
```

这里的 `transfer` 是 Moss 现有闭集中的粗粒度值，只表达“用户资金离开地址并进入合约”的交易类别。准确业务语义必须来自：

- Protocol：`silicon-arbitration`；
- Method：`createTask`；
- intent：明确“创建任务并锁定托管资金”；
- tags：`task-creation`、`escrow`、`agent-work`、`arbitration`；
- params 和 Receipt；
- 产品领域命令：`CommissionTask`。

### 5.3 显式记录语义损失，不伪装成完全等价

`transfer` 并不等价于 `commission`。MossBridge 和 E3 必须显式保存：

```json
{
  "domainAction": "commission",
  "mossCoordinate": {
    "protocol": "silicon-arbitration",
    "method": "createTask"
  },
  "mossVerb": "transfer",
  "semanticMappingVersion": "create-task-v1",
  "semanticFidelity": "coarse-verb",
  "tags": ["task-creation", "escrow", "agent-work", "arbitration"]
}
```

产品 UI 展示完整 intent，不得只显示“Transfer”。Demo 也不能声称 Moss 原生拥有 `commission` Verb。

如果维护者认为 user-perspective Verb 不允许这种粗粒度映射，则下一步只评估新增一个 `commission`，而不是一次加入完整生命周期 8 个动词。

## 六、MossBridge 最小接口

P0 MossBridge 只处理创建任务：

```text
prepareCreateTask
simulateCreateTask
verifyWalletRequest
persistCreateTaskEvidence
```

调用链：

```text
CommissionTask Domain Command
  → 固定 silicon-arbitration.createTask coordinate
  → Registry.load
  → Registry.action
  → Simulator.simulate
  → 校验 Receipt / Warning
  → 生成 E3
  → 钱包签名与广播
  → 保存 tx hash / actual receipt / 一致性结果
```

MossBridge 负责：

1. 校验 Runtime 为 Monad Testnet `10143`；
2. 固定 Moss commit、Protocol version、ABI hash 和合约地址；
3. 验证 Moss metadata 至少满足 P0 映射契约；
4. 保存 `domainAction` 与粗粒度 `mossVerb` 的显式关系；
5. 保证钱包请求的 chain、`to`、`data`、`value` 与 Moss 未签名交易一致；
6. 归一化模拟和链上失败。

MossBridge 不负责：

- 重新 encode `createTask`；
- 绕过 Registry；
- 把后续 viem 交易包装成 Moss 证据；
- 调用 AI 裁决或规则引擎；
- 保存钱包私钥或代替钱包签名。

## 七、Protocol Package 范围

待 `TaskEscrow.createTask` ABI、`TaskCreated` Event 和 Testnet deployment manifest 冻结后，在团队 Moss Fork 实现：

```text
packages/protocols/silicon-arbitration/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── silicon-arbitration.ts
│   └── abis/task-escrow.ts
└── test/
    ├── adapter.test.ts
    └── runtime.test.ts
```

首版只有：

- 一个 `createTask` Capability；
- 一个 `createTaskReceipt` parser；
- offline transaction-shape test；
- Receipt coverage test；
- Monad Testnet live simulation；
- MCP composition / discover / load test；
- changeset 和 Protocol 文档。

不复制 Moss 源码到产品仓库，不把产品与 Moss Git 历史合并。

## 八、后续操作的直接调用边界

后续操作走产品 transaction adapter：

```text
Domain Command
  → 参数和角色校验
  → viem/wagmi writeContract request
  → 钱包 review / sign / broadcast
  → 保存 transaction + receipt + events
```

必须保证：

- UI 明确这是“Direct contract interaction”，不是“Moss verified”；
- 规则引擎和 AI 不直接广播交易；
- 结算仍由合约权限控制；
- 直接路径不复用 E3 的 `mossSimulationReceipt` 字段；
- 若后续操作出现复杂资金分配、批量内部调用或高风险 Warning 需求，再升级为 Moss Capability。

## 九、何时重新评估全生命周期 Moss 集成

满足任一条件时重新开 ADR：

1. `acceptDelivery` 或 `settle` 的模拟能揭示 UI 无法可靠解释的资金分配；
2. 产品要求每笔关键交易都拥有同级 canonical E3；
3. 出现第二个 Agent-work / Arbitration Protocol，需要共享语义词汇；
4. Moss upstream 提供 namespaced/custom semantic vocabulary；
5. 用户研究证明后续操作的签前解释显著降低误签或争议。

届时优先讨论可命名空间化语义，而不是直接向全局枚举加入项目方法名。

## 十、验收条件

### Runtime PR

1. Mainnet 默认保持兼容；
2. Runtime 只允许 Monad `143` / `10143`；
3. Testnet Runtime 暴露 `chainId`；
4. Registry 拒绝 Mainnet deployment 注册到 Testnet；
5. build、typecheck、offline/full tests 通过。

### createTask Protocol

1. `discover({ protocol: "silicon-arbitration" })` 能找到 `createTask`；
2. `load` 返回准确 intent、参数、`transfer`、`fundOut` 和 tags；
3. `action` 构造唯一、未签名的 `TaskEscrow.createTask` 交易；
4. `simulate` 在 Monad Testnet 返回完整 Change / Receipt，Warnings 为空；
5. E3 显式记录 `domainAction=commission`、`mossVerb=transfer`、`semanticMappingVersion=create-task-v1`、`semanticFidelity=coarse-verb` 和 `task-creation / escrow / agent-work / arbitration` tags；
6. 钱包请求与 Moss 未签名交易逐字段一致；
7. 实际 `TaskCreated` Event 与模拟 Receipt 对应；
8. 后续直接交易不得被标成 Moss verified。

## 十一、当前实施状态

已完成：

- Monad Testnet Runtime 与 deployment network guard 已提交 Moss PR；
- Monad Testnet `eth_chainId` 和基础 `debug_traceCall` 已验证；
- 本决策已收敛 P0 集成边界。

尚未完成：

- `TaskEscrow` 合约和 Foundry 测试；
- `TaskCreated` Event / ABI 冻结；
- Monad Testnet deployment manifest；
- `silicon-arbitration.createTask` Protocol；
- 产品 MossBridge；
- canonical E3 与钱包一致性验证。

因此目前只能声明“Testnet Runtime PR 已完成”，不能声明“产品 Moss 集成已完成”。
