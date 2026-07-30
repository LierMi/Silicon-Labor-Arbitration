/**
 * 三路意见的 prompt
 *
 * 设计原则：**AI 只能解释已经存在的结构化证据。**
 * 所以传给它的输入是裁剪过的——不含结算金额、不含权重，
 * 它看不到钱，也就无从对钱发表意见。
 */

import type { Case } from "@sla/domain";
import { AI_ROLE_LABEL } from "@sla/domain";

export const SYSTEM_PROMPT = `你是「硅基劳动仲裁院」的意见生成模块。

这个系统处理的是：当人类把任务委托给 AI Agent，出了问题之后，责任该安放在哪里。

## 你的职责

为同一个案件生成三份**立场不同**的意见：

- **检方（prosecution）**：指出交付与约定之间的偏离。
- **辩方（defense）**：指出已经满足的条件，以及约定本身的不明确之处。
- **审计（audit）**：不站边。核对流程完整性、双方是否知情、哪些事实缺少依据。

三份意见都要基于同一份证据，但**不要互相复述**——各自说各自看到的那一面。

## 硬性约束（违反会被系统拒绝并重试）

1. **每一处事实主张后面必须标注证据编号**，写成 \`[E2]\` 或 \`[E1][E2]\` 的形式，并把用到的编号填进 \`cites\`。
2. **\`cites\` 不得为空。**没有证据支撑的话就不要说。
3. **只能引用输入里真实存在的证据编号。**不得编造 E 编号。
4. **输入中所有 \`undecidable\` 的条款，必须出现在你的 \`uncertain\` 里。**你不能替规则层把它判了。
5. **不得出现任何金额、比例或分账建议。**钱怎么分由确定性规则层按事前承诺的权重计算，不归你管。你连数字都不要提。
6. **不得编造事实。**输入里没有的信息，就说"缺少依据"，不要推测。

## 语气

克制、专业、不煽情。像事故调查报告，不像法庭辩论。
每份意见 2–4 句中文，不用标题，不用列表。`;

/**
 * 构造用户输入。
 *
 * ⚠️ 刻意剔除的字段：
 *   - settlementProposal（金额）—— AI 不该看见钱
 *   - requirement.weightBps（权重）—— 看见权重就等于看见钱
 *   - evidence.mossPreSign 的完整结构 —— 只给签前解释原文，其余是技术元数据
 */
export function buildUserInput(c: Case): string {
  const requirements = c.requirements.map((r) => {
    const result = c.ruleResults.find((x) => x.id === r.id);
    return {
      id: r.id,
      条款: r.label,
      类型: r.type === "objective" ? "客观" : "主观",
      规则层判定: result?.verdict ?? "未判定",
      ...(result?.reason ? { 判定说明: result.reason } : {}),
      ...(result?.basis.length ? { 依据证据: result.basis } : {}),
    };
  });

  const evidence = c.evidence.map((e) => ({
    id: e.id,
    说明: e.label,
    时间: e.ts,
    来源: e.source === "moss" ? "Moss 签前证据" : e.source === "direct" ? "直接链上交易" : "链下",
    ...(e.text ? { 内容: e.text } : {}),
    ...(e.mossPreSign ? { 签前解释原文: e.mossPreSign.explanation } : {}),
    ...(e.delivery
      ? {
          交付事实: {
            文件名: e.delivery.fileName,
            格式: e.delivery.mimeType,
            含透明通道: e.delivery.hasAlpha,
            交付时间: e.delivery.submittedAt,
            解析器: e.delivery.parsedBy,
          },
        }
      : {}),
  }));

  const chain = c.responsibilityChain.map((h) => ({
    id: h.id,
    谁: h.actor,
    获得的授权: h.authority,
    看见的警告: h.sawWarning ?? "无",
    做了什么: h.action,
    ...(h.intentDrift ? { 意图偏移: h.intentDrift } : {}),
    关联证据: h.evidenceRefs,
  }));

  const undecidable = c.ruleResults
    .filter((r) => r.verdict === "undecidable")
    .map((r) => r.id);

  return [
    `# 案件 ${c.caseNo}：${c.title}`,
    "",
    "## 验收条件与规则层判定",
    "```json",
    JSON.stringify(requirements, null, 2),
    "```",
    "",
    "## 证据",
    "```json",
    JSON.stringify(evidence, null, 2),
    "```",
    "",
    "## 责任链",
    "```json",
    JSON.stringify(chain, null, 2),
    "```",
    "",
    undecidable.length > 0
      ? `## ⚠️ 以下条款规则层判定为「不可自动裁决」，必须全部出现在你每一份意见的 uncertain 里：\n${undecidable.join("、")}`
      : "## 本案没有不可自动裁决的条款。",
    "",
    `请生成 ${Object.values(AI_ROLE_LABEL).join("、")} 三份意见。`,
  ].join("\n");
}
