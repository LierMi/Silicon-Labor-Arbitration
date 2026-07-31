# 给 Eleven · D2 同步

## 数据全部就位了，你可以开工

你要的东西现在**一行网络请求都不用发**，本地就有：

```
git pull
```

然后 `packages/domain` 里就是完整的案件数据。有三件事和昨天不一样：

### 1️⃣ AI 的三段意见是真的，不是我编的占位文字

昨天说"三路意见"的时候还只是个空数组。现在里面是**真实调用大模型生成、通过全部校验后固定下来的**三段中文。

每段 100–130 字，三栏并排不会溢出，可以按这个长度做排版。

### 2️⃣ 意见正文里的 `[E1]` `[E2]` 是可以点的

比如这句：

> 交付物文件名为 potato.png，Agent 附言亦称其为「对猫这一概念的后现代重构」**[E2]**

那个 `[E2]` 是**证据角标**——点它应该高亮下面证据列表里对应的那一条。

方括号里保证只会出现真实存在的证据编号（有校验拦着），所以你可以放心地把所有 `[...]` 都做成可点击。

### 3️⃣ 金额现在是算出来的，不是写死的

`0.15 / 0 / 0.05` 这三个数来自"四条验收标准各占 25%"的事前约定。三条满足 → 75% 可支付，一条判不了 → 25% 冻结。

**这条对你的意义：**裁决页上可以理直气壮地把权重显示出来，因为它是有来源的。

---

## 你 D2 要做的两页

| | |
|---|---|
| **裁决与资金结算页** | 四条判定逐条盖章，**C4 那里章落不下去** |
| **3D 印章 + 空章位** | 全站最重要的一帧 |

那一帧的分镜在 `docs/03-视觉灵感与3D方案.md` 第十二节，逐帧时间都写好了。核心是 1.6 秒那个**"停住"**，和 2.4 秒的**全静音**。

> **铁律：其他页面都可以简陋，那一帧不行。**

---

## ⚠️ 一个别碰的地方

数据里有个 `onchain` 的部分（链上信息）。**先别依赖它里面的字段**——Neo 还在做部署，那块随时会变。

你现在能用的所有链下数据都是**冻结的**，按它们做不会返工。

---

## 备注：下面这段可以直接扔给 AI

如果你用 Claude / Cursor 之类的助手写代码，把下面整段复制给它，它就知道该怎么接数据了。

```
项目：Silicon Labor Arbitration（硅基劳动仲裁院）
我负责前端 UI。技术栈：Next.js App Router + TypeScript + Tailwind + shadcn/ui + framer-motion。
数据来自本仓库的 @sla/domain 包，全部是本地固化数据，不需要调任何 API。

## 拿数据

import {
  freshPotatoCase,        // 返回一个完整案件的深拷贝，可反复重置
  CASE_STATUS_LABEL,      // 状态 → 中文标签
  ACTOR_ROLE_LABEL,       // 角色 → 中文标签
  AI_ROLE_LABEL,          // 检方/辩方/审计 → 中文标签
  hasUndecidable,         // 是否存在不可裁决条款
  undecidableIds,         // 不可裁决的条款编号，土豆案返回 ["C4"]
} from "@sla/domain";

const c = freshPotatoCase();

## 关键字段

c.caseNo            卷宗编号，如 "SLA-2026-0001"
c.title             案件标题
c.status            案件状态（8 态之一）
c.requirements[]    验收条件：{ id, label, type: "objective"|"subjective", weightBps }
                    weightBps 是权重，单位基点，四条各 2500 = 各占 25%
c.ruleResults[]     判定结果：{ id, verdict: "satisfied"|"violated"|"undecidable", basis[], reason? }
c.evidence[]        证据：{ id, label, ts, source, text?, delivery?, mossPreSign? }
c.aiArguments[]     三路意见：{ role, text, cites[], uncertain[] }
c.responsibilityChain[]  责任链每一跳：
                    { id, actor, actorRole, authority, sawWarning, action, ts, evidenceRefs[], intentDrift? }
c.settlementProposal     { toAgent: "0.15", toClient: "0", frozen: "0.05" }（字符串，别转 number）
c.onchain           ⚠️ 链上信息，还在变，暂时不要依赖里面的字段

## 四个页面

1. 案件详情与责任链（P0）——竖向时间线，每一跳一张卡片，四栏：
   谁(actor) / 什么授权(authority) / 看见什么警告(sawWarning，null 表示无) / 做了什么(action)
   可选第五项 intentDrift：这一跳相对上一跳的意图偏移，用比正文弱的样式
2. 裁决与资金结算（P0）——四条判定逐条盖章 + 空章位 + 人类终审按钮
3. AI 交叉质询（P1）——三栏并置，每条意见的 cites 做成可点击角标
4. 案件大厅（P1）——案件卡片网格

## 两个必须做对的交互

【证据角标】
意见正文里形如 [E2] 的方括号是可点击角标，点击后高亮 c.evidence 中 id === "E2" 的那条。
方括号内保证只有真实存在的证据编号（有校验拦着），可以放心全部做成可点。

【空章位 —— 全站最重要的一帧】
C1、C2、C3 的 verdict 是 "satisfied"，依次盖上"满足"章。
C4 的 verdict 是 "undecidable"，章要停在半空落不下去，章位留白，旁边显示 ruleResults 里那条的 reason。
用 hasUndecidable(c) 判断是否出现空章位，用 undecidableIds(c) 拿到是哪一条。
分镜（照做）：
  0.0s C3 盖章完成，墨迹渗透
  0.4s 静止，什么都不发生（这 0.4 秒很重要）
  0.6s 印章升起，横移到 C4 位置
  1.2s 开始下落
  1.6s 下落到一半 —— 停住
  1.7s 极轻微颤动（2–3px，频率慢）
  2.0s 镜头缓慢推近（scale 1.0 → 1.08，缓动越慢越好）
  2.4s 音效全部静音，纸面只剩一个影子
  3.0s 「待人工复核」淡入（淡入，不要滑入）
  3.5s 人类终审按钮出现

## 视觉方向

做「卷宗」，不做「判决机」。避开赛博朋克、蓝紫渐变、发光线条、粒子背景——那是所有 web3 项目的默认长相。
气质：一份归档完好、编号齐全、却始终没有署名的责任。
只做桌面端（路演是投屏），不做移动端、不做深色模式。

## 三条实现原则

1. 金额一律当字符串处理，不要 Number() —— 会丢精度
2. 页面上每少一句解释自己的文案，气质就上一档
3. 盖章加程序性的不完美：每次角度和油墨深浅随机微变
   rotate: -3deg + random(-1.5, 1.5)
   opacity: 0.82 + random(-0.06, 0.06)
   完美的重复是软件，微小的不完美是手工
```
