# 硅基劳动仲裁院 · 双仓库架构与 Moss Testnet 集成

> 状态：目标架构
> 更新日期：2026-07-30
> 适用网络：Monad Testnet（Chain ID `10143`）

## 一、架构结论

项目采用“产品主仓库 + 团队 Moss Fork + 固定版本引用”的双仓库模型：

```text
LierMi/Silicon-Labor-Arbitration     产品事实源
            │
            │ vendor/moss（Git submodule，固定 commit）
            ▼
LierMi/moss                          团队 Moss Fork
            │
            │ upstream
            ▼
nishuzumi/moss                       官方 Moss
```

核心原则：

1. `Silicon-Labor-Arbitration` 保存产品、合约、规则引擎、UI、部署证据和集成代码。
2. 团队 Moss Fork 保存 Monad Testnet Runtime 与 `silicon-arbitration` Protocol Package。
3. 官方 Moss 保持只读上游身份，不直接承载黑客松业务代码。
4. 产品仓库只固定一个经过验证的 Moss commit，不复制 Moss 源码、不合并 Git 历史。
5. Moss 是创建任务交易的前置构造与验证层，不参与事后裁决。

## 二、为什么不把两套代码直接合并

Moss 是 Node 22 + pnpm 11 的多包仓库，内部包含 Core、Simulator、System、ERC、Protocol Packages 和 MCP Server，并使用 `workspace:*` 管理依赖。直接复制或合并会带来：

- 上游更新难以追踪；
- 产品提交与框架提交混在同一历史；
- ABI、Protocol 和 Core 改动难以独立审查；
- 无法清楚证明 Demo 使用了哪个 Moss 版本；
- 后续向官方 Moss 提交 Protocol Package 时需要二次拆分。

方案对比：

| 方案 | 结论 | 原因 |
|---|---|---|
| 复制 Moss 源码到产品仓库 | 拒绝 | 丢失上游关系，极易漂移 |
| 合并两个 Git 历史 | 拒绝 | 污染产品历史，维护成本最高 |
| Git subtree | 不采用 | 同步与回馈上游都比 submodule 复杂 |
| 直接依赖 GitHub package | 暂不采用 | Moss 内部 `workspace:*` 尚不适合作为单个 Git 依赖消费 |
| 立即发布团队 npm 包 | 黑客松后再评估 | 增加发布、版本和权限管理成本 |
| 团队 Fork + Git submodule | 采用 | 版本可固定、上游可同步、Protocol 可独立开发 |

## 三、目标目录结构

产品仓库目标：

```text
Silicon-Labor-Arbitration/
├── apps/
│   ├── web/                         # Next.js、钱包、案件体验
│   └── api/                         # 服务端编排、AI 解释、Moss 调用入口
├── contracts/                       # Foundry 合约、测试、部署脚本
├── packages/
│   ├── domain/                      # 跨模块类型与 Schema
│   ├── rule-engine/                 # 只判客观条件的确定性规则层
│   └── moss-bridge/                 # 产品与 Moss 之间唯一的 seam
├── deployments/
│   └── monad-testnet.json           # 地址、部署交易、ABI hash、chainId
├── demo/
│   ├── potato-case.json
│   └── reset-demo.ts
├── vendor/
│   └── moss/                        # 指向团队 Moss Fork 的 submodule
├── docs/
├── AGENTS.md
├── moss.lock.json                   # Moss repo、commit、Protocol 版本、ABI hash
└── pnpm-workspace.yaml
```

团队 Moss Fork 目标增量：

```text
moss/
├── packages/
│   ├── core/                        # 除非 Testnet Runtime 必须，否则不改
│   ├── system/                      # 保留 Mainnet 语义；Testnet 不覆盖 Mainnet 常量
│   ├── mcp-server/                  # 注册项目 Protocol
│   └── protocols/
│       └── silicon-arbitration/
│           ├── src/
│           │   ├── adapter.ts
│           │   ├── index.ts
│           │   └── abis/
│           ├── test/
│           └── README.md
└── ...
```

## 四、Monad Testnet 约束

项目所有链上功能统一运行在 Monad Testnet：

| 配置 | 值 |
|---|---|
| Network | Monad Testnet |
| Chain ID | `10143` |
| Chain ID（hex） | `0x279f` |
| Public RPC | `https://testnet-rpc.monad.xyz` |
| 钱包资产 | Testnet MON，不使用 Mainnet 资金 |

2026-07-30 实测：

- `eth_chainId` 返回 `0x279f`，即 `10143`；
- 公共 Testnet RPC 对基础 `debug_traceCall` 请求返回成功；
- 仍需用真实 `createTask` Capability 验证 Moss Simulator 所需的完整 trace 与状态链能力。

### 当前官方 Moss 与目标网络的差异

官方 Moss `upstream/main` 在 commit `2e7c1dbeb5e6f3b1492455034e3b0348a3c0094d` 上仍明确限定 Monad Mainnet：

- README 写明 Chain ID `143`；
- `packages/core/src/runtime.ts` 在 RPC 不是 `143` 时直接报错；
- `packages/system/src/runtime.ts` 默认使用 `https://rpc.monad.xyz`；
- `packages/system/src/constants.ts` 是 Mainnet WMON / USDC / AUSD 地址；
- `SECURITY.md` 写明 Moss v1 拒绝其他链。

因此，“项目全部跑 Monad Testnet”是本项目的明确需求，但**不是当前官方 Moss 已提供的配置开关**。团队 Fork 必须实现显式 Testnet 支持，并保持以下边界：

1. Mainnet Runtime 与常量保持原义，不把 `143` 全局替换成 `10143`。
2. 增加独立 Testnet Runtime，启动时校验 `10143`。
3. Testnet composition root 不注册 Mainnet-only Protocol 与地址。
4. Silicon 合约地址来自版本化部署清单，不写死在 UI。
5. 所有固定地址都验证 bytecode；ABI 与部署合约做 hash 对齐。

## 五、运行架构

```text
┌─────────────────────────────────────────────────────────────┐
│ Browser / Wallet                                            │
│ 输入自然语言任务 → 查看 Moss 解释 → 显式签名 → 广播交易      │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / Wallet RPC
┌──────────────────────────────▼──────────────────────────────┐
│ Silicon Application                                         │
│                                                             │
│  apps/api                                                   │
│    ├── task orchestration                                   │
│    ├── evidence persistence                                 │
│    └── AI explanation                                       │
│                                                             │
│  packages/moss-bridge                                       │
│    └── prepareTask(input)                                   │
│         ├── discover / load                                 │
│         ├── action                                          │
│         ├── simulate                                        │
│         └── buildPreSignEvidence                            │
└──────────────────────────────┬──────────────────────────────┘
                               │ SDK 或 MCP（服务端）
┌──────────────────────────────▼──────────────────────────────┐
│ Team Moss Fork                                              │
│ Testnet Runtime + silicon-arbitration Protocol + Simulator  │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON-RPC / debug_traceCall
┌──────────────────────────────▼──────────────────────────────┐
│ Monad Testnet                                               │
│ TaskEscrow / CaseRegistry / Settlement / EvidenceRegistry   │
└─────────────────────────────────────────────────────────────┘
```

浏览器不得直接依赖 Moss monorepo，也不得在客户端启动 MCP stdio。Moss 调用位于服务端或受控 Node Runtime；浏览器只接收经过产品接口归一化的数据和待签交易。

## 六、MossBridge：唯一产品 seam

对产品暴露一个小而深的模块，隐藏 Moss 内部复杂度：

```text
MossBridge.prepareTask(input)
  -> capability
  -> unsignedTransactions
  -> simulation
  -> preSignEvidence
```

推荐输入：

```json
{
  "account": "0x...",
  "requirements": [
    { "id": "C1", "type": "objective", "check": "delivered_before_deadline" },
    { "id": "C2", "type": "objective", "check": "file_format", "expect": "PNG" },
    { "id": "C3", "type": "objective", "check": "has_alpha", "expect": true },
    { "id": "C4", "type": "subjective", "check": "depicts_a_cat", "expect": true }
  ],
  "deadline": "...",
  "escrowAmount": "0.2"
}
```

推荐输出：

```json
{
  "chainId": 10143,
  "mossCommit": "...",
  "protocol": "silicon-arbitration",
  "protocolVersion": "...",
  "capability": {},
  "unsignedTransactions": [],
  "simulation": {
    "ok": true,
    "halted": false,
    "receipts": [],
    "warnings": []
  },
  "preSignEvidence": {
    "kind": "moss_pre_sign_explanation",
    "text": "...",
    "canonicalPayloadHash": "0x..."
  }
}
```

不允许：

- UI 直接访问 Registry、Receipt parser 或 Moss decorators；
- 有 Warning 时把交易交给钱包；
- 模拟一套交易、签名另一套交易；
- 只保存一段可编辑文本而不保存结构化上下文和 hash。

## 七、端到端创建任务流程

```text
1. 用户输入自然语言任务和托管金额
2. 应用将意图归一化为结构化 Requirements
3. Moss discover/load 定位 silicon-arbitration.createTask
4. Moss action 构造 Capability Tree 与未签名 createTask 交易
5. Moss Simulator 在 Monad Testnet 执行模拟
6. Receipt parser 解释预期 TaskCreated Event 和资金流
7. MossBridge 检查：无 revert、无 Warning、Receipt 完整覆盖 Changes
8. 应用生成 E3 canonical payload 与 hash
9. 浏览器展示签名前解释、地址、金额、deadline 和风险
10. 用户钱包签名并广播同一笔交易
11. 应用等待确认并读取真实 TaskCreated Event
12. 将真实交易结果与 E3 绑定，形成案件责任链起点
```

Moss 不签名、不广播、不替用户同意，也不参与争议裁决。

## 八、Protocol Package 最小范围

原执行案将 Protocol Package 视为“有余力再做”的 Tier 2，但若项目要真正依托 Moss，Protocol Package 必须成为 P0。因为 Moss 的 Simulator 需要注册 Capability 与对应 Receipt parser，前端自行 encode 一笔未知合约交易后，不能凭空获得完整的 Moss Receipt 验证。

黑客松最小范围只接入：

```text
silicon-arbitration.createTask
```

它必须完成：

- 参数 Schema；
- `TaskEscrow.createTask` calldata；
- Testnet 合约地址；
- 资金风险标签；
- `TaskCreated` Event Receipt parser；
- Capability Tree；
- offline shape test；
- Testnet live simulation；
- MCP server composition。

黑客松 P0 已决定不将 `submitDelivery`、`openDispute`、`settle` 等后续操作接入 Moss。产品通过 viem/wagmi 发送这些交易，并明确区分“Moss 构造的操作”和“产品直接构造的操作”；满足 `docs/08` 的复议条件后再开新 ADR。

## 九、Verb / Category 语义问题

完整决策见 [Moss 边界与职责划分](./08-Moss边界与职责划分.md)。P0 不再把完整仲裁生命周期都建模为 Moss Capability，也不在当前 Runtime PR 中增加 8 个项目专用 Verb、2 个 Category 和 4 个 Risk Label。

需要区分“技术能力”和“产品范围”：

- Moss 技术上可以在每笔交易各自签名前构造和模拟未签名交易；
- 产品 P0 只选择增量价值最高、涉及资金锁定并需要 canonical E3 的 `createTask`；
- `submitDelivery`、`openDispute`、`settle` 等后续操作暂用 viem/wagmi 直接调用，不能标成 Moss verified；
- 后续出现复杂资金分配、强制全链路 E3 或第二个通用用例时，再评估扩大 Moss 范围。

`createTask` 暂用 Moss 现有闭集：

```text
protocol: silicon-arbitration
method: createTask
verb: transfer
category: token
risk: fundOut
tags: task-creation, escrow, agent-work, arbitration
```

`transfer` 只是资金进入托管合约的粗粒度 Moss Verb，不等价于完整业务语义 `commission`。MossBridge 和 E3 必须同时保存 `domainAction=commission`、`mossVerb=transfer`、mapping version 和 `semanticFidelity=coarse-verb`；UI 必须展示准确 intent，不能只显示“Transfer”。

该决策冻结了 P0 范围，但实际 Protocol Package 仍依赖 `TaskEscrow.createTask` ABI、`TaskCreated` Event、Monad Testnet 地址和 Receipt parser。

## 十、E3 证据结构

E3 不能只有一句“签名前解释”。至少包含：

| 字段 | 作用 |
|---|---|
| `chainId` | 证明运行在 Monad Testnet |
| `rpcFingerprint` | 记录模拟环境，不保存私密 RPC Key |
| `mossRepository` / `mossCommit` | 固定 Moss 实现版本 |
| `protocol` / `protocolVersion` | 固定 Adapter 语义 |
| `contractAddress` / `abiHash` | 固定被调用合约 |
| `domainAction` / `mossVerb` | 显式保存 `commission` 与粗粒度 `transfer` 的映射 |
| `semanticMappingVersion` / `semanticFidelity` | 固定映射版本并声明 `coarse-verb` 语义损失 |
| `capability` | 保存 Moss 结构化意图 |
| `unsignedTransactions` | 保存签名前交易 |
| `simulationReceipts` | 保存结构化模拟结果 |
| `warnings` | 必须为空才能继续 |
| `explanationText` | 用户看到的解释 |
| `canonicalPayloadHash` | 防止链下正文被悄悄修改 |
| `createdAt` | 证据生成时间 |

钱包签名后还要保存：

- transaction hash；
- receipt status；
- block number；
- 实际事件；
- 实际交易与预签交易的一致性检查结果。

## 十一、跨仓库开发与版本固定

跨仓库变更顺序：

```text
Silicon 合约接口和事件冻结
  → Monad Testnet 部署并记录 ABI hash
  → 团队 Moss Fork 实现 Protocol
  → Moss build/typecheck/lint/test/live simulation
  → 合并 Moss PR，获得 commit SHA
  → Silicon 更新 vendor/moss 指针与 moss.lock.json
  → Silicon 端到端验证
```

禁止直接在 submodule detached HEAD 上开发。正确做法：

```text
独立 clone/worktree 开发团队 Moss Fork
  → push feature branch
  → merge PR
  → 回到产品仓库更新 submodule pointer
```

Feature Freeze 后停止跟随上游 Moss；只允许将已验证的紧急修复 cherry-pick 到团队 Fork，再更新产品锁定版本。

## 十二、三人并行边界

| 成员 | 主责目录 | 交付接口 |
|---|---|---|
| NEO | `contracts/`、`packages/moss-bridge/`、团队 Moss Fork、`deployments/` | ABI、地址、Capability、simulation result |
| RISO | `packages/domain/`、`packages/rule-engine/`、`apps/api/` | Case Schema、RuleResult、AI arguments、demo seed |
| ELEVENT | `apps/web/` | 使用 typed mock/live adapter 的完整交互 |

共享类型集中在 `packages/domain/`。UI 先依赖 typed mock adapter，Live adapter 可用后只切换数据源，不重写页面。

## 十三、CI 与验收

### 团队 Moss Fork

```text
pnpm lint
pnpm build
pnpm typecheck
pnpm test:offline
Testnet createTask live simulation
```

### 产品仓库

```text
pnpm lint
pnpm build
pnpm typecheck
pnpm test
forge test
```

端到端验收必须证明：

- RPC chain ID 是 `10143`；
- 合约地址在 Testnet 有 bytecode；
- Protocol 使用的 ABI hash 与部署版本一致；
- `createTask` 模拟无 Warning；
- 钱包签的是 Moss 模拟过的同一笔交易；
- 交易成功并发出预期 `TaskCreated` Event；
- E3 可通过 canonical hash 重算；
- Mainnet 地址、Mainnet RPC 和真实资金没有进入 Demo 路径。

## 十四、当前决策摘要

| 决策 | 结果 |
|---|---|
| 产品网络 | Monad Testnet only |
| Moss 地位 | 创建任务路径的核心依赖 |
| 代码管理 | 产品主仓库 + 团队 Moss Fork + Git submodule |
| Moss 调用位置 | 服务端 MossBridge，不在浏览器直接调用 |
| 钱包职责 | 唯一签名与广播边界 |
| 首个 Protocol Capability | `createTask` |
| P0 Moss 范围 | 仅 `createTask`；后续写操作走 Direct 路径 |
| createTask 语义 | `transfer + fundOut + 精确 intent/tags`，E3 标记 `coarse-verb` |
| Moss 是否裁决 | 否 |
| Mainnet 是否用于 Demo | 否 |
| E3 | 结构化、可 hash、绑定 Moss commit 与交易上下文 |
