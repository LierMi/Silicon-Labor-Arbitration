# Showcase Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复不依赖新素材的可信度、可读性、责任链和交互问题，使三段体验可用于诚实路演。

**Architecture:** 领域 fixture 继续作为唯一事实源；可展示状态由纯函数从 fixture 派生；页面不再硬编码时间与链上状态。证据层补足转译和工具日志，故事责任链与技术授权链分别呈现。

**Tech Stack:** TypeScript、React 19、Next.js 15、GSAP、Node test runner。

## Global Constraints

- 不伪造广播、链上确认、证物格式或哈希。
- C4 保持不可自动裁决。
- 缺素材处只显示待补状态。
- 优先验证 1280x720。

---

### Task 1: 案件数据真实性

**Files:**
- Modify: `packages/domain/src/validate.ts`
- Modify: `packages/domain/src/canonical.test.ts`
- Modify: `packages/domain/src/fixtures/potato-case.ts`

- [ ] 写非法证据哈希的失败测试并确认 RED。
- [ ] 实现证据哈希校验，删除 E2 假哈希，补 E4/E5。
- [ ] 统一时间、证据引用、钱包动作和状态。
- [ ] 运行 domain tests 确认 GREEN。

### Task 2: 页面状态与时间派生

**Files:**
- Create: `apps/web/app/case-presentation.ts`
- Create: `apps/web/app/case-presentation.test.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/app/experience.tsx`
- Modify: `apps/web/app/courtroom/page.tsx`

- [ ] 写时间、展示状态和链上诚实标签的失败测试并确认 RED。
- [ ] 实现展示模型并替换硬编码时间、状态与数量。
- [ ] 第一幕提前显示核心条款和冻结规则。
- [ ] 运行 Web tests 与 typecheck。

### Task 3: 导航、换幕和人工复核

**Files:**
- Modify: `apps/web/app/experience.tsx`

- [ ] 写可测试的幕次 hash 解析与持久化规则。
- [ ] Logo 返回 `/courtroom`，幕次同步 URL hash。
- [ ] 抽屉与弹窗打开时禁用全局导航。
- [ ] 人工意见加入复核身份和本地持久化。

### Task 4: 投屏可读性与双链视觉

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/courtroom/courtroom.module.css`
- Modify: `apps/web/app/experience.tsx`

- [ ] 放大 1280x720 下关键正文与操作控件。
- [ ] 技术链拆分为授权/资金与执行/责任两条轨迹。
- [ ] 补六幕移动端纵向降级。
- [ ] 标记交付图片为预览副本。

### Task 5: 完整验证

**Files:**
- Verify only

- [ ] 运行 domain tests、Web tests、typecheck、production build。
- [ ] 浏览器复测三条路径和关键交互。
- [ ] 记录仍依赖素材的唯一剩余项。
