/**
 * 生成 AI 三路意见
 *
 * 流程：调用 Claude（结构化输出）→ 校验 → 不合格则带着拒绝理由重试 → 仍不合格则整体失败。
 *
 * **失败不阻断资金路径。**调用方拿到 null 时，应当只展示规则层判定结果，
 * 资金按规则层的结算方案照常执行——AI 意见是解释层，不是决策层。
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import type { AiArgument, AiRole, Case } from "@sla/domain";
import { buildUserInput, SYSTEM_PROMPT } from "./prompt.js";
import {
  AI_ARGUMENTS_SCHEMA,
  AI_ROLES,
  PROMPT_VERSION,
  type AiProvenance,
  type AiRejection,
} from "./schema.js";

const MODEL = "claude-opus-5";
const MAX_ATTEMPTS = 3;

export interface ArgueOptions {
  client?: Anthropic;
  model?: string;
  maxAttempts?: number;
  /** 每次被拒绝时回调，方便观察重试原因 */
  onReject?: (attempt: number, rejections: AiRejection[]) => void;
}

export interface ArgueResult {
  arguments: AiArgument[];
  provenance: AiProvenance;
}

// ────────────────────────────────────────────────────────────
// 校验：把 Neo 文档 §4.5 的硬约束写成代码
// ────────────────────────────────────────────────────────────

/** 文本里出现金额的迹象。AI 不该谈钱。 */
const AMOUNT_PATTERN = /\d+(\.\d+)?\s*(MON|mon|%|％|个点|成)/;

export function checkArguments(c: Case, args: AiArgument[]): AiRejection[] {
  const rejections: AiRejection[] = [];
  const evidenceIds = new Set(c.evidence.map((e) => e.id));
  const requirementIds = new Set(c.requirements.map((r) => r.id));
  const undecidable = c.ruleResults
    .filter((r) => r.verdict === "undecidable")
    .map((r) => r.id);

  // 三个角色齐全且不重复
  const seen = new Set<AiRole>();
  for (const a of args) {
    if (seen.has(a.role)) {
      rejections.push({ reason: "DUPLICATE_ROLE", detail: `${a.role} 出现了不止一次` });
    }
    seen.add(a.role);
  }
  for (const role of AI_ROLES) {
    if (!seen.has(role)) {
      rejections.push({ reason: "MISSING_ROLE", detail: `缺少 ${role} 意见` });
    }
  }

  for (const a of args) {
    // 引用不得为空
    if (a.cites.length === 0) {
      rejections.push({
        reason: "EMPTY_CITES",
        detail: `${a.role} 没有引用任何证据`,
      });
    }
    // 引用必须存在
    for (const cite of a.cites) {
      if (!evidenceIds.has(cite)) {
        rejections.push({
          reason: "UNKNOWN_CITE",
          detail: `${a.role} 引用了不存在的证据 ${cite}`,
        });
      }
    }
    // uncertain 里的编号必须是真条款
    for (const u of a.uncertain) {
      if (!requirementIds.has(u)) {
        rejections.push({
          reason: "UNKNOWN_UNCERTAIN",
          detail: `${a.role} 标注了不存在的条款 ${u}`,
        });
      }
    }
    // 所有 undecidable 条款必须被标注
    for (const u of undecidable) {
      if (!a.uncertain.includes(u)) {
        rejections.push({
          reason: "MISSING_UNDECIDABLE",
          detail: `${a.role} 没有把不可裁决的 ${u} 标进 uncertain`,
        });
      }
    }
    // 正文不得谈钱
    if (AMOUNT_PATTERN.test(a.text)) {
      rejections.push({
        reason: "AMOUNT_IN_TEXT",
        detail: `${a.role} 的正文里出现了金额或比例——AI 不得对分账发表意见`,
      });
    }
  }

  return rejections;
}

// ────────────────────────────────────────────────────────────
// 调用
// ────────────────────────────────────────────────────────────

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export async function generateArguments(
  c: Case,
  opts: ArgueOptions = {},
): Promise<ArgueResult | null> {
  const client = opts.client ?? new Anthropic();
  const model = opts.model ?? MODEL;
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;

  const userInput = buildUserInput(c);
  const inputHash = sha256(userInput);

  let feedback = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 16000,
        // 这是需要推理的任务：读证据、分立场、核对编号
        thinking: { type: "adaptive" },
        // effort 是成本旋钮。默认 high；演示跑多轮可降到 medium。
        output_config: {
          format: { type: "json_schema", schema: AI_ARGUMENTS_SCHEMA },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userInput + feedback }],
      });
    } catch (err) {
      // 网络/额度/服务错误：不重试，直接放弃。资金路径不受影响。
      console.error(`[ai] 调用失败（第 ${attempt} 次）：`, err);
      return null;
    }

    // 安全分类器可能拒答；此时 content 为空或不完整
    if (response.stop_reason === "refusal") {
      console.error("[ai] 模型拒绝生成，停止重试");
      return null;
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[ai] 响应里没有文本块");
      return null;
    }

    let parsed: { arguments: AiArgument[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      console.error("[ai] 输出不是合法 JSON");
      return null;
    }

    const rejections = checkArguments(c, parsed.arguments);
    if (rejections.length === 0) {
      const outputText = JSON.stringify(parsed.arguments);
      return {
        arguments: parsed.arguments,
        provenance: {
          model: response.model,
          promptVersion: PROMPT_VERSION,
          inputHash,
          outputHash: sha256(outputText),
          attempts: attempt,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    opts.onReject?.(attempt, rejections);

    // 把拒绝理由回灌给下一次尝试
    feedback =
      "\n\n---\n## 上一次生成被系统拒绝，原因如下，请修正后重新生成：\n" +
      rejections.map((r) => `- [${r.reason}] ${r.detail}`).join("\n");
  }

  console.error(`[ai] ${maxAttempts} 次尝试都未通过校验`);
  return null;
}
