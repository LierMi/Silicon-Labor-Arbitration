# Eleven UI 场景与代码架构流程

> 状态：Draft for Eleven
> 日期：2026-08-03
> 目标：先把 UI 骨架、两个视觉场景、D2 数据接法和后续 Spline 接入路径讲清楚。

---

## 0. 结论先行

先做 **UI 骨架 + 本地数据串联**，不要先做完整 3D，也不要先接视频。

当前前端第一阶段只需要三种表现层：

| 类型 | 用在哪里 | 现在怎么做 | 后续怎么升级 |
|---|---|---|---|
| **2D UI** | 案件信息、证据、规则、金额、AI 三栏意见 | React + Tailwind + shadcn/ui | 保持为主 UI |
| **CSS / DOM 伪 3D** | 大屏爆炸卷宗、责任链断层、空章位保底 | `div` / CSS transform / framer-motion | 可替换为 Spline |
| **Spline 3D** | C4 悬停印章、责任链透明层片 | 第二阶段接入 | React 只传状态，不让 Spline 管业务 |
| **视频** | 不进 P0 产品代码 | 不做 | D9 录 demo 备份用 |

> 视频只做路演备份，不作为 UI 架构的一部分。

---

## 1. 严格遵守 D2 同步文件

来源文件：`docs/给ELEVEN-D2同步.md`。

### 1.1 数据接法

现在前端 **不需要任何网络请求**，直接读 `@sla/domain` 的固化土豆案数据：

```ts
import {
  freshPotatoCase,
  CASE_STATUS_LABEL,
  ACTOR_ROLE_LABEL,
  AI_ROLE_LABEL,
  hasUndecidable,
  undecidableIds,
} from "@sla/domain";

const c = freshPotatoCase();
```

必须遵守：

1. **不要依赖 `c.onchain` 字段做 UI 主逻辑**
   Neo 还在改部署与链上字段。链下字段已经冻结，可以放心用。

2. **金额保持字符串**
   `c.settlementProposal.toAgent / toClient / frozen` 都是字符串，不能 `Number()`。

3. **C4 保持 `undecidable`**
   这是 demo 高潮，不是待修 bug。

4. **证据角标可点击**
   AI 意见里的 `[E1]`、`[E2]`、`[E3]` 都保证存在，点击后高亮对应证据。

### 1.2 当前可用字段

| 字段 | UI 用法 |
|---|---|
| `c.caseNo` | 卷宗编号 |
| `c.title` | 案件标题 |
| `c.status` | 案件状态 |
| `c.requirements[]` | C1-C4 条款 |
| `c.ruleResults[]` | satisfied / violated / undecidable |
| `c.evidence[]` | E1/E2/E3 证据列表 |
| `c.aiArguments[]` | 检方 / 辩方 / 审计三栏 |
| `c.responsibilityChain[]` | 责任链每一跳 |
| `c.settlementProposal` | 0.15 / 0 / 0.05 MON |

---

## 2. 技术栈

使用前文已认可的路线，并与执行案一致：

```text
Next.js App Router
TypeScript
Tailwind
shadcn/ui
framer-motion
wagmi + viem（等 Riso/Neo hooks，就绪前不用）
RainbowKit（钱包入口，后续接）
Spline（第二阶段，只做 3D 视觉表现）
```

仓库当前还没有 `apps/web`，创建时需要同时更新 `pnpm-workspace.yaml`：

```yaml
packages:
  - apps/*
  - packages/*
  - vendor/moss/packages/*
  - vendor/moss/packages/protocols/*
```

---

## 3. 页面开发顺序

### 第 1 个页面：大屏入口页

建议路径：

```text
apps/web/app/demo/page.tsx
```

页面目标：先把项目气质和两个视觉母题立住。

首屏包括：

- 项目名：`Silicon Labor Arbitration`
- 案件编号：`SLA-2026-0001`
- 中心视觉：**爆炸卷宗**
- 鼠标跟随效果：碎片和证据牌轻微跟随鼠标偏移
- 入口按钮：进入土豆案

这个页面是用户刚说的“第一张大屏内容，有鼠标跟随效果”。

素材类型：

| 素材 | 类型 | 说明 |
|---|---|---|
| 悬浮纸片 | 2D DOM / CSS 3D | 参考 Cold Dark Matter，碎片停在空中 |
| E1/E2/E3 证据牌 | 2D DOM | 鼠标靠近时轻微偏移 |
| 空中心 | 2D DOM | 表示责任落点缺席 |
| 细线 / 悬线 | CSS border / SVG line | 表示悬吊与可追溯 |

不要用视频。不要先上 Spline。
先用 CSS 和 framer-motion 做到可演示。

组件拆分：

```text
components/visual/ExplodedArchiveHero.tsx
components/visual/FloatingEvidenceFragment.tsx
components/visual/MouseFollowField.tsx
```

### 第 2 个页面：案件详情与责任链页

建议路径：

```text
apps/web/app/demo/case/page.tsx
```

页面目标：让评委看懂“责任如何在委托链里被转译、传递、稀释”。

内容：

- 案件头：`c.caseNo`、`c.title`、`CASE_STATUS_LABEL[c.status]`
- 原始需求：`E1`
- 交付证据：`E2`
- Moss 签前证据：`E3`
- 责任链时间线：`c.responsibilityChain`
- 第二视觉母题：**爆炸轴测 / 透明责任断层**

素材类型：

| 素材 | 类型 | 说明 |
|---|---|---|
| 责任链卡片 | 2D UI | 每一跳一张卡片 |
| 透明层片 | CSS / DOM 伪 3D | 对应爆炸轴测图 |
| 层间连接线 | CSS / SVG | 表示可追溯 |
| 鼠标 hover 高亮 | React state | hover 时间线卡片，高亮对应层片 |

组件拆分：

```text
components/case/CaseHeader.tsx
components/case/EvidenceStrip.tsx
components/case/ResponsibilityTimeline.tsx
components/visual/ResponsibilityLayerStack.tsx
```

这里的第二视觉场景先用 DOM/CSS 实现，后续可以替换为 Spline：

```text
Layer_HumanIntent
Layer_MainAgent
Layer_WorkerAgent
Layer_Tool
Layer_Wallet
Layer_Delivery
```

### 第 3 个页面：裁决与资金结算页

建议路径：

```text
apps/web/app/demo/verdict/page.tsx
```

页面目标：实现 D2 铁律 —— **C4 的章落不下去**。

内容：

- C1-C4 条款：`c.requirements`
- 判定结果：`c.ruleResults`
- 权重：`weightBps / 100`
- 金额：`c.settlementProposal`
- 人类终审按钮

素材类型：

| 素材 | 类型 | 说明 |
|---|---|---|
| 四条规则表 | 2D UI | 主信息 |
| C1-C3 印章 | CSS / framer-motion | 盖章、墨迹渗透 |
| C4 空章位 | CSS / framer-motion | 章停住，纸面留白 |
| 3D 印章 | Spline 第二阶段 | 替换 CSS 保底 |

组件拆分：

```text
components/verdict/RuleChecklist.tsx
components/verdict/CssStampVerdict.tsx
components/verdict/SettlementSummary.tsx
components/verdict/HumanReviewButton.tsx
```

Spline 替换位：

```tsx
{useSpline ? (
  <VerdictSpline sceneUrl={sceneUrl} ruleResults={ruleResults} />
) : (
  <CssStampVerdict caseData={c} />
)}
```

### 第 4 个页面：AI 交叉质询页

建议路径：

```text
apps/web/app/demo/arguments/page.tsx
```

页面目标：证明 AI 只解释，且每句话必须引用证据。

内容：

- 三栏：`prosecution / defense / audit`
- 每栏显示 `AI_ROLE_LABEL[role]`
- 正文中的 `[E1]`、`[E2]`、`[E3]` 可点击
- 右侧或底部证据列表被高亮

素材类型：

| 素材 | 类型 | 说明 |
|---|---|---|
| 三栏证词 | 2D UI | 不用 3D |
| 证据角标 | Button / Badge | 点击高亮证据 |
| 证据列表 | 2D UI | 和角标联动 |

组件拆分：

```text
components/arguments/AiArgumentColumns.tsx
components/arguments/CitationText.tsx
components/arguments/EvidenceList.tsx
```

### 第 5 个页面：案件大厅页

建议路径：

```text
apps/web/app/demo/cases/page.tsx
```

页面目标：让产品不是只有一页 demo。

P1 做。当前只需要一张 `freshPotatoCase()` 卡片即可。

---

## 4. 两个视觉场景的落地说明

用户希望 UI 骨架里先有两个视觉方案：

1. **Cold Dark Matter 式：爆炸卷宗大屏**
2. **Exploded Axonometric 式：透明责任断层**

这两个场景都先用 **2D DOM + CSS 3D + framer-motion** 做，不先上 Spline。

### 4.1 场景一：爆炸卷宗大屏

位置：

```text
app/demo/page.tsx
```

视觉目标：

> 一份完整案件被拆成碎片，所有证据都在，只有责任中心缺席。

交互：

- `onPointerMove` 记录鼠标位置
- 根元素设置 CSS 变量：

```ts
style={{
  "--mx": `${mouse.x}px`,
  "--my": `${mouse.y}px`,
}}
```

- 每个碎片按不同系数位移：

```css
transform:
  translate3d(calc(var(--dx) * 1px), calc(var(--dy) * 1px), 0)
  rotate(var(--rotate));
```

需要的元素：

```text
Fragment_E1_Requirement
Fragment_E2_Delivery
Fragment_E3_Moss
Fragment_AgentLog
Fragment_WalletSignature
Fragment_ToolParams
Void_ResponsibilityUnassigned
```

不要出现：

- AI 机器人
- 法官
- 蓝紫霓虹
- 区块链节点球

### 4.2 场景二：透明责任断层

位置：

```text
app/demo/case/page.tsx
```

视觉目标：

> 每一层都能解释自己收到什么、做了什么，但没有一层能独自承担全部责任。

数据映射：

| 层片 | 数据 |
|---|---|
| `Layer_HumanIntent` | `responsibilityChain[0]` |
| `Layer_MainAgent` | `responsibilityChain[1]` |
| `Layer_WorkerAgent` | `responsibilityChain[2]` |
| `Layer_Tool` | `responsibilityChain[3]` |
| `Layer_Wallet` | `responsibilityChain[4]` |
| `Layer_Delivery` | `E2 delivery` |

交互：

- hover 时间线卡片，高亮对应层片
- hover 层片，高亮对应时间线卡片
- 鼠标移动只做轻微透视变化，不做夸张镜头

初版实现：

```text
CSS perspective
absolute layer cards
opacity 递减
activeLayer state
```

后续 Spline 对象命名：

```text
Layer_HumanIntent
Layer_MainAgent
Layer_WorkerAgent
Layer_Tool
Layer_Wallet
Layer_Delivery
```

---

## 5. Spline 接入边界

Spline 只在第二阶段接，不阻塞 UI 骨架。

### 5.1 需要安装

```bash
pnpm add @splinetool/react-spline @splinetool/runtime
```

### 5.2 只允许 Spline 管表现

Spline 不负责：

- 钱包
- Moss
- 合约
- AI
- 规则计算
- 证据高亮主逻辑

React 负责业务状态，Spline 只接收状态：

```ts
{
  C1: "satisfied",
  C2: "satisfied",
  C3: "satisfied",
  C4: "undecidable",
  activeLayer: "Layer_WorkerAgent"
}
```

### 5.3 Spline 必须命名的对象

```text
Stamp_Main
Stamp_Shadow_C4
Paper_Base
Clause_C1
Clause_C2
Clause_C3
Clause_C4
Mark_C1
Mark_C2
Mark_C3
Empty_Mark_C4

Layer_HumanIntent
Layer_MainAgent
Layer_WorkerAgent
Layer_Tool
Layer_Wallet
Layer_Delivery
```

---

## 6. 文件结构建议

最小结构：

```text
apps/web/
  app/
    demo/
      page.tsx
      case/
        page.tsx
      verdict/
        page.tsx
      arguments/
        page.tsx
      cases/
        page.tsx
  components/
    visual/
      ExplodedArchiveHero.tsx
      FloatingEvidenceFragment.tsx
      ResponsibilityLayerStack.tsx
    case/
      CaseHeader.tsx
      EvidenceStrip.tsx
      ResponsibilityTimeline.tsx
    verdict/
      RuleChecklist.tsx
      CssStampVerdict.tsx
      SettlementSummary.tsx
      HumanReviewButton.tsx
    arguments/
      AiArgumentColumns.tsx
      CitationText.tsx
      EvidenceList.tsx
  lib/
    case-data.ts
```

`lib/case-data.ts` 只做一件事：

```ts
import { freshPotatoCase } from "@sla/domain";

export function getDemoCase() {
  return freshPotatoCase();
}
```

不要现在抽象 repository / service / adapter。等 hooks 真的交付再换。

---

## 7. 组件数据流

### 7.1 现在

```text
@sla/domain
  ↓ freshPotatoCase()
app/demo/*
  ↓ props
components/*
```

无 fetch，无 API，无 onchain 主逻辑。

### 7.2 Riso hooks 到位后

```text
wagmi hooks / viem events
  ↓ normalize 成 Case 形状
页面组件不改，只换数据来源
```

页面组件不要直接依赖合约事件字段。

---

## 8. 关键交互实现规格

### 8.1 鼠标跟随大屏

要求：

- 鼠标只影响视觉层，不影响数据状态
- 位移幅度小，像悬浮，不像游戏
- 支持鼠标离开时缓慢回中

实现建议：

- `useMotionValue`
- `useSpring`
- 每个碎片传 `depth`
- 位移 = `(mouse - center) * depth`

### 8.2 证据角标

解析 AI 正文里的 `[E1]`：

```ts
const parts = text.split(/(\[E\d+\])/g);
```

渲染规则：

- 普通文字：`span`
- `[E2]`：`button`
- 点击：`setActiveEvidenceId("E2")`
- 证据列表中 `id === activeEvidenceId` 高亮

### 8.3 空章位

必须按 D2 同步分镜：

```text
0.0s C3 盖章完成，墨迹渗透
0.4s 静止，什么都不发生
0.6s 印章升起，横移到 C4 位置
1.2s 开始下落
1.6s 下落到一半，停住
1.7s 极轻微颤动，2–3px
2.0s 镜头缓慢推近，scale 1.0 → 1.08
2.4s 全静音，纸面只剩影子
3.0s「待人工复核」淡入
3.5s 人类终审按钮出现
```

初版用 `framer-motion`。Spline 只能增强，不能替代这个保底。

---

## 9. 验收标准

### 9.1 UI 骨架验收

- [ ] `/demo` 能看到爆炸卷宗大屏
- [ ] 鼠标移动时碎片有轻微跟随
- [ ] `/demo/case` 能看到责任链时间线
- [ ] hover 时间线能高亮责任断层
- [ ] `/demo/verdict` 能看到 C1-C3 盖章、C4 空章位
- [ ] `/demo/arguments` 能看到三栏 AI 意见
- [ ] `[E1] [E2] [E3]` 可点击并高亮证据

### 9.2 数据验收

- [ ] 只从 `@sla/domain` 读取数据
- [ ] 不请求 API
- [ ] 不依赖 `c.onchain`
- [ ] 金额未转 number
- [ ] C4 仍为 `undecidable`
- [ ] 页面显著标注 mock 数据，因为 `c.isMock === true`

### 9.3 视觉验收

- [ ] 像卷宗，不像判决机
- [ ] 没有赛博朋克、蓝紫渐变、粒子背景
- [ ] 没有机器人拟人形象
- [ ] 空章位一眼能看懂：章停住，纸面没有印记

---

## 10. 推荐实际开工顺序

今天如果只做最短路径：

```text
1. 创建 apps/web
2. 接 @sla/domain，渲染 caseNo / title / evidence
3. 做 /demo 大屏爆炸卷宗
4. 做 /demo/case 责任链 + 透明断层
5. 做 /demo/verdict CSS 空章位
6. 做 /demo/arguments 证据角标
7. 再考虑 Spline 替换 C4 印章区域
```

不要先做：

- 完整 Spline 场景
- 视频
- 移动端
- 真实链上数据
- 自己重新定义 Case 类型

---

## 11. 给 Eleven 的判断

你现在的两个视觉方案可以进 UI 骨架，但它们的角色不同：

1. **爆炸卷宗**：大屏开场，用来建立“责任中心缺席”的气质。
2. **透明责任断层**：案件详情页，用来解释“责任如何一层层被转译”。
3. **空章悬停**：裁决页高潮，是 D2 最高优先级，不可被前两个视觉方案挤掉。

所以优先级是：

```text
UI 数据骨架 > 空章位保底 > 大屏鼠标跟随 > 责任断层 > Spline 精修 > 视频备份
```
