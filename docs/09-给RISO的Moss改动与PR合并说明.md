# 给 RISO 的 Moss 改动与 PR 合并说明

> 目的：用最短时间理解这轮 Moss 方案为什么调整、两个 PR 分别改了什么，以及合并后团队下一步做什么。

## 一、30 秒结论

这轮有两个独立 PR：

1. [Silicon Labor Arbitration PR #1](https://github.com/LierMi/Silicon-Labor-Arbitration/pull/1)：产品架构与决策文档；
2. [Moss PR #1](https://github.com/LierMi/moss/pull/1)：让 Moss 显式支持 Monad Testnet Runtime，并阻止 Mainnet deployment 被误用到 Testnet。

最终产品边界：

```text
createTask
  → Moss discover / load / action / simulate
  → 保存完整 E3
  → 钱包签名与广播

submitDelivery / openDispute / settle / 其他后续写操作
  → viem / wagmi Direct 路径
  → 钱包签名与广播
  → 保存普通交易证据
  → 不标记为 Moss verified 或 Moss E3
```

Moss 不参与裁决，不签名、不广播。浏览器钱包仍是唯一签名边界。

## 二、为什么方案发生了变化

最初讨论过把完整生命周期都接入 Moss，并向 Moss Core 增加 8 个 Verb、2 个 Category 和 4 个 Risk Label。

重新逐文件审读 Moss 的 Runtime、Registry、Capability、Simulator、MCP Server 和参考 Protocol 后，我们收敛为更小的 P0：

- Moss 技术上可以模拟后续交易，但前提是先为每个操作实现 Protocol Capability、未签交易构造和 Receipt parser；
- 黑客松阶段没有必要把完整业务状态机都改造成 Moss Protocol API；
- `createTask` 会锁定资金、建立任务事实根，并需要签前解释与 E3，Moss 的增量价值最高；
- 后续状态推进先走 Direct 路径，避免扩大 Adapter、Receipt parser 和 live simulation 的维护面；
- 当前不向 Moss 全局 MCP schema 注入项目专用的完整生命周期词表。

因此，旧的全生命周期方案已在 `docs/07` 标记为 Superseded，当前事实源是 `docs/08`。

## 三、Moss PR #1 改了什么

PR：[feat: add explicit Monad testnet runtime](https://github.com/LierMi/moss/pull/1)

当前 Head：`006efe60028fc4760cca7df522b208959289c3a4`

### 3.1 Runtime 网络身份

- 保留 Monad Mainnet `143` 作为默认行为；
- 新增显式 Monad Testnet `10143` Runtime；
- Runtime 连接 RPC 后校验实际 chain ID；
- 只允许 `143` 和 `10143`，不把 Moss 变成任意 EVM chain escape hatch；
- Runtime 暴露选定的 `chainId`，供后续 Registry 安全检查使用。

### 3.2 Deployment 安全边界

仅能连接 Testnet RPC 还不够，因为 Moss bundled Protocol 的地址原本属于 Mainnet。

PR 增加：

- deployment-specific Protocol 声明其 `chainId`；
- Registry 注册 Protocol 时检查 Runtime 与 deployment 是否一致；
- Testnet Runtime 拒绝 Mainnet WMON、Kuru、PancakeSwap deployment；
- address-free Protocol 或真实 Testnet deployment 才能进入 Testnet composition root。

这是本 PR 最重要的安全修复：避免在 Testnet Demo 中构造指向 Mainnet 常量地址的交易。

### 3.3 Testnet 工厂与测试

- 新增 `monadTestnetRuntime()`；
- 默认公共 RPC：`https://testnet-rpc.monad.xyz`；
- 增加 Mainnet 默认、显式 Testnet、RPC mismatch、unsupported chain 和 deployment mismatch 测试；
- 使用真实 Monad Testnet `debug_traceCall` 验证 native transfer simulation；
- 测试不签名、不广播。

### 3.4 Moss PR 明确没有做什么

- 没有增加 `commission / dispute / settle` 等全局 Verb；
- 没有增加 `agent-work / arbitration` Category；
- 没有实现 `silicon-arbitration.createTask` Protocol；
- 没有加入产品 Solidity 合约或 ABI；
- 没有让 Moss 签名、广播或参与裁决。

## 四、产品文档 PR #1 改了什么

PR：[docs: define Moss testnet integration architecture](https://github.com/LierMi/Silicon-Labor-Arbitration/pull/1)

### 4.1 双仓库边界

```text
产品仓库
  ├── Solidity 合约、ABI、deployment manifest
  ├── MossBridge、E3、规则引擎、AI 解释、UI
  └── vendor/moss submodule 固定已验证 commit

团队 Moss Fork
  ├── Monad Testnet Runtime
  ├── silicon-arbitration Protocol Package
  └── MCP composition 与 Adapter 测试
```

不复制 Moss 源码，不合并两个仓库的 Git 历史。

### 4.2 P0 只接入 createTask

`createTask` 的计划 Moss metadata：

```text
protocol: silicon-arbitration
method: createTask
verb: transfer
category: token
risk: fundOut
tags: task-creation, escrow, agent-work, arbitration
```

`transfer` 只是 Moss 现有闭集中的粗粒度 Verb，不等于完整业务语义 `commission`。我们没有隐藏这层损失。

E3 必须显式保存：

```text
domainAction = commission
mossVerb = transfer
semanticMappingVersion = create-task-v1
semanticFidelity = coarse-verb
tags = task-creation / escrow / agent-work / arbitration
```

UI 不能只显示“Transfer”，Demo 也不能宣称 Moss 原生支持 `commission`。

### 4.3 E3 不是一段解释文本

E3 至少包含：

- 用户看到的签前解释原文；
- chain ID 和 RPC 环境指纹；
- Moss commit、Protocol version；
- contract address、ABI hash；
- Capability 参数；
- 未签交易；
- simulation Receipt 与 Warning；
- 上述领域语义映射；
- canonical payload hash；
- 钱包请求与 Moss 未签交易的一致性结果；
- 广播后的 transaction hash、真实 Receipt 和 Event。

### 4.4 文档事实源

RISO 建议优先阅读：

1. [`docs/08-Moss边界与职责划分.md`](./08-Moss边界与职责划分.md)：当前 Accepted 决策；
2. [`docs/05-双仓库架构与Moss-Testnet集成.md`](./05-双仓库架构与Moss-Testnet集成.md)：完整技术链路；
3. [`docs/06-技术风险与决策清单.md`](./06-技术风险与决策清单.md)：P0 风险、状态和验收门；
4. [`AGENTS.md`](../AGENTS.md)：团队、仓库和签名边界。

`docs/07` 仅保留旧方案的决策轨迹，不再作为实施依据。

## 五、这些改动对 RISO 的直接影响

### 5.1 Domain / Rule Engine

- 领域动作继续使用准确语义，如 `CommissionTask`，不跟随 Moss 的粗粒度 `transfer` 改名；
- 规则引擎不依赖 Moss Registry、Decorator 或 Receipt 内部类型；
- 主观条件仍保持 `undecidable`，Moss 不参与裁决；
- Direct 路径的后续交易证据不能伪装成 Moss simulation evidence。

### 5.2 AI 解释

- AI 只能解释已经存在的结构化证据，不能凭空补造 Moss Receipt；
- `cites` 必须引用真实证据编号；
- AI 输出不能改变 Moss 未签交易、模拟结果或链上回执；
- E3 中的解释文本必须和用户签名前看到的内容一致。

### 5.3 产品与 Demo 口径

可以说：

> Moss 构造并模拟了创建任务的未签交易，我们把完整签前证据保存成 E3；后续争议与结算由产品 Direct 路径推进。

不能说：

- 所有生命周期交易都经过 Moss；
- Moss 参与仲裁或裁决；
- `transfer` 就是 Moss 原生的任务委托语义；
- 只有一句解释文本就构成完整 E3；
- 项目已经完成 `silicon-arbitration` Protocol 或真实 Testnet 端到端集成。

## 六、建议的 PR 审查与合并顺序

### 6.1 先确认产品决策

在产品 PR #1 重点确认：

- [ ] 是否接受“黑客松 P0 只接入 `createTask`”；
- [ ] 是否接受后续写操作走 Direct 路径且不标记 Moss verified；
- [ ] 是否接受 `transfer + 精确 intent/tags + 显式 coarse-verb` 的临时映射；
- [ ] E3 字段是否满足规则引擎、AI 解释和责任链需求；
- [ ] 团队分工是否准确。

如果以上边界没有异议，产品 PR 可使用 **Squash and merge**。这是文档与架构 PR，不依赖 Moss PR 已经合并。

### 6.2 再审查 Moss Runtime PR

在 Moss PR #1 重点确认：

- [ ] Mainnet 默认兼容是否保留；
- [ ] Testnet chain ID 是否固定为 `10143`；
- [ ] RPC chain mismatch 是否 fail closed；
- [ ] Mainnet deployment 是否会被 Testnet Runtime 拒绝；
- [ ] 测试是否只模拟、不签名、不广播；
- [ ] PR 是否保持 Runtime 单一主题，没有混入 Protocol 或词表扩展。

确认后建议使用 **Squash and merge**。合并后记录团队 Moss main 的新 commit SHA。

### 6.3 不要在这两个 PR 中顺手加入的内容

- upstream 同步；
- `silicon-arbitration` Protocol；
- Solidity 合约；
- 全生命周期 Verb / Category / Risk 扩展；
- 产品 submodule 指针；
- MossBridge 业务实现。

这些内容应使用后续独立短分支和 PR，避免扩大当前审查面。

## 七、合并后的下一步

```text
1. 冻结 TaskEscrow.createTask 与 TaskCreated Event
2. 创建 Foundry 工程并完成合约测试
3. 部署到 Monad Testnet
4. 生成 deployments/monad-testnet.json 与 ABI hash
5. 从团队确认的 Moss 基线创建 feat/silicon-arbitration-protocol
6. 实现 createTask Capability + Receipt parser
7. 完成真实 Testnet action → simulate
8. 实现产品 MossBridge、钱包一致性门和 E3
9. 更新 vendor/moss submodule 指针
10. 完成端到端 Demo
```

在第 7 步完成前，不应对外宣称“产品已完成 Moss Testnet 集成”。目前准确说法是：

> Monad Testnet Runtime PR 和产品集成架构已经完成；createTask Protocol 与真实产品闭环尚待 ABI、部署地址和 Receipt parser。

## 八、当前 PR 状态快照

截至 2026-07-30：

| PR | 状态 | Mergeable | 用途 |
|---|---|---|---|
| [Silicon Labor Arbitration #1](https://github.com/LierMi/Silicon-Labor-Arbitration/pull/1) | OPEN | MERGEABLE | 产品架构、P0 边界、E3 与风险清单 |
| [Moss #1](https://github.com/LierMi/moss/pull/1) | OPEN | MERGEABLE | Monad Testnet Runtime 与 deployment guard |

如果 GitHub 页面显示新的 commit 或冲突，应以 PR 页面的实时状态为准，不以本快照代替合并前检查。
