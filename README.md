<h1 align="center">硅基劳动仲裁院</h1>

<p align="center">
  <b>SILICON LABOR ARBITRATION</b><br>
  <b>SLA · The Unfinished Verdict</b>　—— 未完成的判决
</p>

<br>

<p align="center">
  <i>AI can arbitrate the measurable. Humans decide the meaningful.</i><br>
</p>

<p align="center">
  <i>Here, SLA means two things: Silicon Labor Arbitration<br>
  —and the Service Level Agreement an agent failed to fulfill.</i><br>
</p>

<br>

<p align="center">
  <b>当人类把行动委托给 AI，责任不能也一起被委托掉。</b>
</p>

<p align="center">
  <b>在线演示：</b><br>
  <a href="https://silicon-labor-arbitration.vercel.app/">开屏页</a>
  ·
  <a href="https://silicon-labor-arbitration.vercel.app/courtroom">六幕法庭体验</a>
</p>

---

## 问题

一次委托，今天会经过这样一条链：

```
人类提出目标
  → 主 Agent 理解任务
    → 主 Agent 雇佣专业 Agent
      → 专业 Agent 调用第三方工具
        → 工具生成交易或交付结果
          → 钱包完成支付
```

出问题的时候，每一环都有理由：

| 谁 | 说什么 |
|---|---|
| 人类 | "我没有让它这样做。" |
| 主 Agent | "我是根据用户意图推理的。" |
| 工作 Agent | "我只是完成上游给我的任务。" |
| 工具提供者 | "我只执行收到的参数。" |
| 钱包 | "交易签名是合法的。" |

每个环节似乎都站得住，最后却没有主体承担责任。

> **真正的被告不是人类，也不是 AI，而是责任在委托链中的消失。**

---

## 我们不出判决

2026 年 7 月 10 日，27 家公司（含 OKX、MetaMask、ZKsync）发布了 **Internet Court**——1,001 个 AI validator 在 30–60 分钟内给出**终局判决**，明确声明不含人类法官。

我们做相反的事。

```
Internet Court    →  判决书      （AI 判，人退出）
Silicon Labor Arbitration  →  责任时间线  （AI 只解释，人保留终审）
```

**我们叫仲裁院，不叫法院。仲裁本来就不是终审**——不服的可以上诉。这不是我们的妥协，是"仲裁"这个制度自带的属性。

空难调查（NTSB 模式）也从不定罪，只还原事实。**调查的合法性来自还原，不来自定罪。**

---

## SLA 的两个意思

**SLA** 既是 **S**ilicon **L**abor **A**rbitration，
也是那份 Agent 没能履行的 **S**ervice **L**evel **A**greement。

这不是巧合。我们的机制在结构上就是一份 SLA：

| SLA 的结构 | 我们的实现 |
|---|---|
| 事先约定的可测量标准 | 验收条件 C1–C4 |
| 托管的赔偿准备金 | `TaskEscrow` 锁定的资金 |
| 事后核算是否达标 | 确定性规则层 |
| 未达标的赔付 | 分账 / 冻结 |

**但 SLA 只能写客观指标**——可用率、延迟、交付时间、文件格式。

> **没有任何一份 SLA 能写"必须是一只猫"。**

主观条件写不进 SLA，这是这套工业标准二十年来的公认边界。而 Agent 时代的委托恰恰大量是主观的——"适合儿童产品的橙色猫"这种话，人听得懂，SLA 装不下。

**所以我们的名字里藏着我们的边界：SLA 能仲裁可测量的，剩下的交给人。**

---

## 三条腿的桌子

判不了 C4 之后，还有一个更难的问题：**那 0.2 MON 怎么办？**

最自然的做法是按权重分——C1、C2、C3 各占 25% 且全部满足，那就先付 75%。

**这个做法是错的。**

加权求和有一个隐含前提：**条款之间可分割，价值可以独立累加。**

- 买 10 箱水，送到 7 箱 → 那 7 箱**有独立价值**，付 70% 合理
- 定制一张桌子，少一条腿 → **没有独立价值**，桌子不能用

一张按时交付的、PNG 的、背景透明的**土豆**图，对委托人的价值是零。格式条款之所以有意义，是因为它服务于「一只猫」这个主体。**主体没了，格式合规一文不值。**

> 大陆法系管这个叫**可分给付 / 不可分给付**，判断标准是「部分履行对债权人是否有独立价值」。

更要命的是第二层：按权重付 75%，**本身就是一个价值判断**——它认定「格式合规值 75%」，而这个判断没有依据。

**我们一边说「我判不了」，一边把 75% 的钱付出去了。**

所以条款在签名前就要标明是否为**核心条款**（`essential`），并和权重一起进哈希：

| 核心条款的状态 | 结果 |
|---|---|
| ✅ 满足 | 按 `weightBps` 正常结算 |
| ❌ 违反 | 全额退委托人，附属条款权重不予兑现 |
| ⬜ **不可裁决** | **全额冻结，交给人** |

规则引擎依然会算出「本可支付 0.15」并保留在 `essentialOverride.wouldHaveBeen` 里——**它算得出来，但主动不动手。**

> **能算，但克制。这比直接付 75% 更接近我们想说的话。**

---

## 怎么运作

```
第一层  链上证据层     任务、授权、时间、交付哈希、支付与申诉记录
                        ↓
第二层  确定性规则层   预算、截止、格式、是否交付、是否越权
                        ⚠️ 只有这一层能动钱
                        ↓
第三层  解释与复核层   AI 交叉质询和解释；人类保留最终申诉权
                        ⚠️ 这一层不能动钱
```

AI 在这里**不判**。它只负责：把任务转成结构化验收条件、生成检方/辩方/审计三路意见、**引用证据编号**解释结论、对不确定的事实明确标注"不确定"。

不允许：修改链上证据、决定资金金额、无证据编造事实、绕过用户签名。

### 为什么不能是「五个 AI 投票，票多者胜」

**模型数量更多不代表更正确，也不能自然获得审判人类的合法性。**

投票把「谁说了算」的问题偷换成了「谁人多」。而我们要回答的从来不是「哪个答案更受欢迎」，是「**这笔钱凭什么这么分**」——那需要一条能被复算的推导，不是一次表决。

所以动钱的那一层完全不依赖 AI 共识：金额由**签名前就哈希上链**的权重算出，任何人拿到条款原文都能自己复算一遍。

### 三条铁律

1. **不出判决。** 发现自己在写「AI 投票决定钱怎么分」，立刻停手。
2. **不伪造性能数据。** 推断模型必须在页面上标注为推断。
3. **C4 判不了这件事不许被优化掉。** 它是产品最想说的话，不是待修的 bug。

---

## 演示：土豆案

用户支付 0.2 MON，要求 Agent：

> 画一只适合儿童产品的橙色猫，背景透明，PNG 格式，北京时间 2026 年 8 月 6 日 00:10 前交付。

Agent 交付了**一颗土豆**，并解释：

> "这是对猫这一概念的后现代重构。"

用户拒绝付款。Agent 发起劳动仲裁。规则层逐条核验：

| 条款 | 内容 | 判定 |
|:--:|---|---|
| C1 | 按时交付 | ✅ 满足 |
| C2 | PNG 格式 | ✅ 满足 |
| C3 | 背景透明 | ✅ 满足 |
| **C4** | **是一只猫** | ⬜ **不可自动裁决** |

由于 C4 在签名前已标记为不可分割的核心条款，C4 不可裁决时，**0.2 MON 全额冻结并转人工复核**。C1–C3 的格式合规不能单独产生可用交付价值。

**系统诚实地说：我判不了 C4。我告诉你我判不了。你来判。**

在所有人都在吹"AI 全自动"的 2026 年，敢标记自己判不了，就是我们的立场。

笑点来自"土豆是不是猫"，留下的问题是——

> **一个 Agent 能否用漂亮的解释，掩盖它没有完成约定的事实？**

---

## 技术

### 合约

原方案是四个合约（TaskEscrow / CaseRegistry / Settlement / EvidenceRegistry）。
实现时**塌缩成一个 `TaskEscrow.sol`** —— 案件、结算、证据哈希都挂在同一个
`taskId` 上，跨合约调用只会增加重入面积和 gas，换不到任何隔离收益。

| 职责 | 实现 |
|---|---|
| 任务与托管 | `createTask` 锁定资金，`taskId` 由参数哈希导出 |
| 生命周期 | 8 状态机：`Created → Delivered → Accepted \| Disputed → Settled / ManualReview / Refunded` |
| 结算 | `settle(toAgent, toClient, frozen)` 只搬运规则层算出的金额，链上只校验守恒 |
| 人类终审 | `releaseFrozen` 释放冻结部分，必须写入 `reviewDecisionHash` |
| 证据 | 只存哈希（`requirementsHash` / `deliveryHash` / `settlementProposalHash`），正文在链下 |

已部署 Monad Testnet：[`0x67040374b8A9756586De0885f01d1291cE8FFCcF`](https://testnet.monadexplorer.com/address/0x67040374b8A9756586De0885f01d1291cE8FFCcF)（chain 10143，区块 49534792）

**全网统计通过事件在链下聚合**，合约内不维护任何全局计数器。

### 承诺：为什么「0.2 全额冻结」是可复算的，不是我们说了算

这是整套机制的技术支点。

验收条款和各自的权重，在 `createTask` **之前**就被规范化序列化并哈希上链：

```
{"version":"req-canon-v1","requirements":[
  {"check":"...","essential":false,"expect":"...","id":"C1","label":"...","type":"objective","weightBps":2500},
  ...
]}
                    ↓ keccak256
requirementsHash → createTask 的第一个参数
```

**任何人拿到条款原文，跑一遍同样的规范化，就能自己算出这个哈希**，与链上入参比对。对不上，就说明条款被事后改过。

规范化本身是有讲究的——同一份数据能写成很多种字节（键序、空格、数组顺序），所以必须钉死唯一写法：键升序、无空格、条款按 id 排序、字段清单固定、带格式版本号。序列化器还会**拒绝**任何无法确定性表示的值（浮点、`undefined`、`Date`、`Map`、类实例），宁可报错也不猜——**承诺环节里，静默的转换就是静默的伪造。**

同一套机制也用在 E3 上：Moss 签前证据的 `canonicalPayloadHash` 覆盖的是**案件里真正存着的那一份**，改一个字就对不上。

### 合约安全

| 做法 | 防的是什么 |
|---|---|
| 逐级相减校验守恒 | `a + b + c != total` 的直觉写法会溢出绕回，凭空造出钱 |
| Checks-Effects-Interactions + **按 taskId 隔离**的重入锁 | 转账瞬间控制权交给对方；全局锁会让不相干的案件互相争抢 |
| Pull over Push | 一方收款失败不阻塞另一方，失败额度转为可提取 |
| `settlementAuthority` / `authorityAdmin` **强制不同地址** | 职责分离：一个能动钱，一个能换「谁能动钱」 |
| 权限两步转移（提名 → 主动接受） | 手滑填错地址不会把权限打进黑洞 |
| 部署守卫（生命周期未完成前拒绝上主网） | 合约不能改，防手滑必须写进代码 |

### 测试

```
合约（Foundry）   33 passed    单元 + fuzz 1000 runs + 不变量 1000 runs × 500,000 calls，0 reverts
TypeScript        67 passed    domain 31 · moss-bridge 23 · web 13
```

不变量测试的核心那条：**把七个操作随机打乱顺序调用 50 万次，每次之后检查「这个任务欠出去的钱有没有超过最初存进来的钱」。**`reverts: 0` 说明这 50 万次全都真的执行了，不是靠报错蒙混过关。

CI 在每个 PR 上跑完整门禁（`pnpm verify` + Foundry + 卫生检查）。

### 为什么是 Monad

每个 `caseId` / `taskId` 都是**独立状态**，案件之间不争用任何全局变量：

```
案件 A → 独立证据、质押、裁决、结算
案件 B → 独立证据、质押、裁决、结算
案件 C → 独立证据、质押、裁决、结算
```

大量案件可以同时提交证据、进入审查、完成结算。**Monad 的意义不是让单个案件更复杂，而是让未来数千个 Agent 微任务产生的争议能够低成本、并行处理。**

并行执行改变了一条设计原则：**交易之间不能争抢同一块存储**。所以 `taskId` 不是自增的，是从参数导出的：

```solidity
taskId = keccak256(abi.encode(
    block.chainid, address(this), msg.sender,
    requirementsHash, deadline, msg.value
));
```

自增计数器意味着每一笔 `createTask` 都要读写同一个变量——一百个人同时下单，一百笔交易排队甚至重跑。哈希导出让每个任务落在自己的存储槽里，互不干扰。

实测：10 个任务并发创建，10/10 成功，4.4 秒。

> ⚠️ 确定性 ID 有个副作用：**同样的参数会算出同样的 ID**，第二次必然撞车。所以 `deadline` 必须在运行时计算，绝不能写死——写死那天是好的，几天后突然开始失败。

> 我们不使用全局递增计数器与全局统计变量。不伪造性能数据——推断模型在页面上标注为推断。

### Moss

Moss 让用户用自然语言表达链上任务，**在签名前解释将要发生什么**。
我们处理的是**签完之后，发生的事和说好的不一样**。

> **Moss 是事前解释，仲裁院是事后追责。仲裁院是 Moss 的下半场。**

我们把用户看到的签前解释原文，与 Capability、未签交易、模拟 Receipt、Moss/Protocol/ABI 版本、语义映射和 canonical hash 一起组成案件的第一份证据 `E3`。
当事情没按这份可重算、可追溯的签前证据发生时，它才具有归责价值。

### 系统架构

<img src="docs/diagrams/architecture.svg" alt="System Architecture" width="100%">

**当前实现（monorepo packages）：**

| 层 | 说明 |
|---|---|
| **Verification & Tooling** | `scripts/e2e-verify.ts`（全生命周期验证）、`concurrency-demo.ts`、Foundry 测试 |
| **Silicon Packages** | `Domain`（共享类型）→ `Rule Engine`（确定性检查器）→ `AI Explanation`（三路意见）→ `MossBridge`（唯一 Moss seam） |
| **Moss Fork (vendor/moss)** | Testnet Runtime → `silicon-arbitration` Protocol → Trace Simulator |
| **Monad Testnet** | `TaskEscrow` 合约（已部署 `0x6704...FFCcF`，chain 10143） |

**Moss 边界：** Moss 只覆盖 `createTask`（构造 → 模拟 → E3 签前证据）。`assignAgent`、`submitDelivery`、`acceptDelivery`、`openDispute`、`settle` 全部通过 viem 直接调用，不标记为 Moss verified。

> UI 已实现为 Next.js 三段式演示（爆炸画廊、法庭总览、六幕案卷），当前读取 typed fixture。合约部署与 E3 Moss 模拟是真实记录；土豆案尚未广播，页面会明确区分部署事实、模拟记录与案件链上确认。

### 端到端流程

<img src="docs/diagrams/e2e-flow.svg" alt="E2E Flow" width="100%">

**Moss Path（创建任务）：** 用户输入 → MossBridge 构造未签交易 → Simulator 在 Testnet 模拟 → 无 Warning 则生成 E3 签前证据 → 用户查看后显式签名 → 交易确认发出 TaskCreated 事件。

**Direct Path（后续生命周期）：** `assignAgent → submitDelivery → acceptDelivery`（viem 直接调用）→ 争议时 `openDispute → settle`（规则引擎按 `weightBps` 分账）→ 无法自动裁决的部分冻结为 Manual Review。

**签名边界：** 钱包是唯一签名与广播边界。Moss 从不签名、从不广播；Direct Path 交易不得标为 Moss verified。

### TaskEscrow 状态机

<img src="docs/diagrams/task-lifecycle.svg" alt="Task Lifecycle" width="100%">

**Happy Path:** Created → Delivered → Accepted（全款归 Agent）  
**Dispute Path:** Delivered → Disputed → `settle()` 客观部分按 `weightBps` 分账；`frozen>0` 则进入 Manual Review，`releaseFrozen()` 人类终审后释放  → Settled  
**Expiry:** Created → Refunded（截止时间到，无人交付，`refundExpiredTask`）

> 完整交互版（含 dark/light 主题切换、PNG/SVG 导出）见 `docs/diagrams/architecture.html`、`docs/diagrams/e2e-flow.html`、`docs/diagrams/task-lifecycle.html`。

---

## 路线图：从仲裁到审计

**现在（黑客松）**——一个能亲手走完一次仲裁的可验证 Demo：下单、交付、争议、责任链、规则判定、结算、人类终审。

**下一步**——把托管与归因做成开源协议，让 Agent 框架可以直接接入；消费而不是挑战既有标准（ERC-7710 授权链、ERC-8004 Agent 身份与验证），别人的标准越普及，我们的原料越多。

**再往后**——真正的需求不在"纠纷双方"，在**要向监管交代的人**。当企业开始大规模部署 Agent，合规、风控与保险会要求：出了事，能证明是哪一步、谁的授权、谁忽略了警告。

那时候我们今天的三个"劣势"会全部翻转：

| 今天看起来像妥协的 | 在合规场景里是 |
|---|---|
| 人保留终审权 | **刚需**——人类问责是监管强制的 |
| 不出判决，只出时间线 | **正是审计报告要的形态** |
| 不做行业标准 | **只做工具，卖给已经在用标准的人** |

**不是给 Agent 建法院，是给部署 Agent 的人做黑匣子。**

---

> ### 我们没有替你做决定。
> ### 我们只是把责任找回来，摆在你面前。

---

## 快速开始

> **当前状态：开发阶段。** 合约已部署 Monad Testnet，Moss Protocol 和 MossBridge 已实现并通过 live simulation。下列命令需要完成 PR 合并、依赖安装和钱包配置后才能完整执行。

### 前置条件

- Node.js ≥ 22、pnpm、Foundry
- Monad Testnet RPC（`https://testnet-rpc.monad.xyz`，chain ID `10143`）
- 有 MON 测试币的 Testnet 钱包

### 合约

```bash
cd contracts
cp .env.example .env  # 填入 DEPLOYER_PRIVATE_KEY、SETTLEMENT_AUTHORITY_ADDRESS、AUTHORITY_ADMIN_ADDRESS
forge build
forge test -vvv        # 33 tests, 2 fuzz @ 1000 runs, 1 stateful invariant @ 1000 runs / 500k calls
```

已部署合约：

| 字段 | 值 |
|---|---|
| 合约地址 | `0x67040374b8A9756586De0885f01d1291cE8FFCcF` |
| 链 | Monad Testnet（10143） |
| 部署交易 | `0xb96eecedc5038735c40aa9918c3369f829bb3b93468d38b3b66f87ce9e896e34` |
| 部署区块 | 49534792 |
| Moss-facing ABI hash | `0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5` |

### Moss 集成

```bash
git submodule update --init --recursive  # vendor/moss
```

Moss live simulation 已通过：

```text
Protocol: silicon-arbitration | Method: createTask
Reverted: false | Gas: 217,941 | Warnings: 0
Receipt: TaskCreated (taskId, client, amount, reqHash, deadline)
```

### E2E 验证

```bash
cd scripts && npm install && npx tsx e2e-verify.ts
```

全生命周期：`createTask → assignAgent → submitDelivery → acceptDelivery → status=Accepted`

### 并发 Demo

```bash
npx tsx scripts/concurrency-demo.ts 30
```

30 个独立任务并发创建，记录真实 tx hash、确认时间、gas。

```bash
# ⚠️ 必须带 --recurse-submodules。vendor/moss 是 submodule，
#    不带的话它是空目录，pnpm install 会报 ENOENT 且看不出原因。
git clone --recurse-submodules https://github.com/LierMi/Silicon-Labor-Arbitration.git

# 已经 clone 过的：git pull 不会自动更新 submodule，装依赖时会自动补
pnpm install                   # postinstall 会跑 git submodule update --init

cp packages/ai/.env.example packages/ai/.env.local   # 填 GONKA_API_KEY
pnpm typecheck                 # 检查全部 packages
```

合约测试需要 [Foundry](https://getfoundry.sh)：

```bash
pnpm test:contracts            # 33 个测试，含 50 万次调用的资金不变量
```

合约：

```bash
cd contracts
forge test        # 资金路径测试
forge script ...  # 部署到 Monad Testnet
```

> `.gitignore` 使用 `.env*` 通配，任何形态的密钥文件都不会被提交。

---

## 文档

| 文档 | 内容 |
|---|---|
| [01 · 项目方案](docs/01-项目方案.md) | 核心理念、立场、流程、范围 —— **先读这份** |
| [02 · 开发执行案](docs/02-开发执行案.md) | 合约方案、分工、排期、Go/No-Go |
| [03 · 视觉灵感与 3D 方案](docs/03-视觉灵感与3D方案.md) | 关键词、艺术与游戏参考、2D/3D、节奏 |
| [04 · 竞品调研](docs/04-竞品调研.md) | Internet Court 拆解、五个差异点、Q&A 弹药库 |
| [05 · 双仓库架构与 Moss Testnet 集成](docs/05-双仓库架构与Moss-Testnet集成.md) | 产品仓库、团队 Moss Fork、Testnet Runtime、Protocol 与 E3 证据链 |
| [06 · 技术风险与决策清单](docs/06-技术风险与决策清单.md) | 已核验事实、P0/P1/P2 问题、负责人、决策门与验收证据 |
| [08 · Moss 边界与职责划分](docs/08-Moss边界与职责划分.md) | P0 只集成 createTask、粗粒度 Verb 映射、后续直接调用边界与升级条件 |
| [09 · 给 RISO 的 Moss 改动与 PR 合并说明](docs/09-给RISO的Moss改动与PR合并说明.md) | 两个 PR 的改动摘要、产品影响、审查重点、合并顺序与下一步 |
| [AGENTS.md](AGENTS.md) | AI Agent 与团队共同遵循的网络、仓库、架构和验证约定 |

---

## 团队

| | |
|---|---|
| **Riso** | 产品 · 规则引擎 · AI 层 · 统筹 |
| **Neo** | 合约 · Moss · 链上集成 |
| **Eleven** | UI · 视觉 · 交互 |

---

<p align="center">
<b>我们没有替你做决定。</b><br>
我们只是把责任找回来，摆在你面前。
</p>

## 本地验证

```bash
git clone --recurse-submodules <repo>     # ⚠️ 必须带 --recurse-submodules
cd Silicon-Labor-Arbitration
pnpm install
pnpm verify                                # 构建 Moss + typecheck + 全部测试
```

已经克隆过但没带那个参数：

```bash
git submodule update --init --recursive && pnpm install
```

> **为什么不能靠 `postinstall` 自动 init**
>
> `pnpm-workspace.yaml` 引用了 `vendor/moss/packages/*`，而 pnpm 在**任何**
> 生命周期脚本（含 `preinstall`）之前就要解析 workspace。子模块没拉下来，
> install 直接报 `ENOENT: scandir …/protocols/silicon-arbitration`。
> 这个先后顺序没有脚本钩子能绕开——只能在克隆时就带上子模块。

单独跑：

| 命令 | 作用 |
|---|---|
| `pnpm build:moss` | 只构建 moss-bridge 真正依赖的 Moss 包 |
| `pnpm typecheck` | 构建 Moss 后做类型检查 |
| `pnpm test` | 构建 Moss 后跑测试 |
| `pnpm test:contracts` | Foundry 合约测试（需先装 forge）|

> **为什么 `build:moss` 只构建一部分**
>
> `vendor/moss` 里有 16 个包，其中 `@themoss/abi-tools` 缺 `@types/node`，
> 全量构建会挂在它的 dts 步骤上。而我们只用 `core` / `simulator` /
> `system` / `protocol-silicon-arbitration` 四个，
> 所以按 `--filter "<pkg>..."`（含依赖）精确构建，既绕开了那个失败，
> 也快得多。
>
> 上游修好 `abi-tools` 之后可以放开，但**没有理由为了构建用不到的包而失败**。
