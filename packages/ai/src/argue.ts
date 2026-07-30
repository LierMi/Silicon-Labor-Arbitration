/**
 * 生成 AI 三路意见
 *
 * 流程：调模型 → 解析 → 校验 → 不合格则带着拒绝理由重试 → 仍不合格则整体失败。
 *
 * **失败不阻断资金路径。**调用方拿到 null 时，只展示规则层判定结果，
 * 资金按规则层的结算方案照常执行——AI 是解释层，不是决策层。
 */

import { createHash } from "node:crypto";
import type { AiArgument, AiRole, Case } from "@sla/domain";
import { buildUserInput, JSON_ONLY_INSTRUCTION, SYSTEM_PROMPT } from "./prompt.js";
import { resolveProvider, type ProviderConfig } from "./provider.js";
import {
  AI_ARGUMENTS_SCHEMA,
  AI_ROLES,
  PROMPT_VERSION,
  type AiProvenance,
  type AiRejection,
} from "./schema.js";

const MAX_ATTEMPTS = 3;

export interface ArgueOptions {
  provider?: Partial<ProviderConfig>;
  maxAttempts?: number;
  /** 每次被拒绝时回调，方便观察重试原因 */
  onReject?: (attempt: number, rejections: AiRejection[]) => void;
}

export interface ArgueResult {
  arguments: AiArgument[];
  provenance: AiProvenance;
}

// ────────────────────────────────────────────────────────────
// 校验：产品不变量，与供应商无关
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
    if (a.cites.length === 0) {
      rejections.push({ reason: "EMPTY_CITES", detail: `${a.role} 没有引用任何证据` });
    }
    for (const cite of a.cites) {
      if (!evidenceIds.has(cite)) {
        rejections.push({
          reason: "UNKNOWN_CITE",
          detail: `${a.role} 引用了不存在的证据 ${cite}`,
        });
      }
    }
    for (const u of a.uncertain) {
      if (!requirementIds.has(u)) {
        rejections.push({
          reason: "UNKNOWN_UNCERTAIN",
          detail: `${a.role} 标注了不存在的条款 ${u}`,
        });
      }
    }
    for (const u of undecidable) {
      if (!a.uncertain.includes(u)) {
        rejections.push({
          reason: "MISSING_UNDECIDABLE",
          detail: `${a.role} 没有把不可裁决的 ${u} 标进 uncertain`,
        });
      }
    }
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
// 容错解析
// ────────────────────────────────────────────────────────────

/**
 * 没有结构化输出保证时，模型经常把 JSON 包在 ```json 围栏里，
 * 或者前后带一句"好的，以下是……"。这里把这些情况都吃掉。
 */
export function extractJson(raw: string): unknown | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], raw].filter((s): s is string => typeof s === "string");

  for (const text of candidates) {
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      // 退一步：截取第一个 { 到最后一个 }
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
          /* 继续试下一个候选 */
        }
      }
    }
  }
  return null;
}

function asArguments(parsed: unknown): AiArgument[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const list = (parsed as { arguments?: unknown }).arguments;
  if (!Array.isArray(list)) return null;
  const out: AiArgument[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    if (typeof o["role"] !== "string" || typeof o["text"] !== "string") return null;
    out.push({
      role: o["role"] as AiRole,
      text: o["text"],
      cites: Array.isArray(o["cites"]) ? (o["cites"] as string[]) : [],
      uncertain: Array.isArray(o["uncertain"]) ? (o["uncertain"] as string[]) : [],
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// 调用
// ────────────────────────────────────────────────────────────

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export async function generateArguments(
  c: Case,
  opts: ArgueOptions = {},
): Promise<ArgueResult | null> {
  const provider = resolveProvider(opts.provider);
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;

  // 不支持结构化输出的供应商，改用 prompt 约束 + 容错解析
  const userInput =
    buildUserInput(c) + (provider.structuredOutput ? "" : JSON_ONLY_INSTRUCTION);
  const inputHash = sha256(userInput);

  let feedback = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await provider.client.messages.create({
        model: provider.model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userInput + feedback }],
        ...(provider.thinking
          ? {
              // 需要推理：读证据、分立场、核对编号
              thinking: { type: "adaptive" as const },
              // effort 是成本旋钮。调 prompt 阶段用 low，定型后切 high。
              output_config: {
                effort: "low" as const,
                ...(provider.structuredOutput
                  ? { format: { type: "json_schema" as const, schema: AI_ARGUMENTS_SCHEMA } }
                  : {}),
              },
            }
          : {}),
      });
    } catch (err) {
      // 网络/额度/服务错误：不重试，直接放弃。资金路径不受影响。
      console.error(`[ai:${provider.name}] 调用失败（第 ${attempt} 次）：`, err);
      return null;
    }

    if (response.stop_reason === "refusal") {
      console.error(`[ai:${provider.name}] 模型拒绝生成，停止重试`);
      return null;
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const args = asArguments(extractJson(raw));

    if (!args) {
      // 没有结构化输出保证时，解析失败是可以靠重试救回来的
      opts.onReject?.(attempt, [
        { reason: "EMPTY_CITES", detail: "输出不是预期的 JSON 结构" },
      ]);
      feedback =
        "\n\n---\n## 上一次输出无法解析。只输出 JSON 对象本身，不要任何解释文字或代码围栏。";
      continue;
    }

    const rejections = checkArguments(c, args);
    if (rejections.length === 0) {
      const outputText = JSON.stringify(args);
      return {
        arguments: args,
        provenance: {
          provider: provider.name,
          model: response.model || provider.model,
          promptVersion: PROMPT_VERSION,
          inputHash,
          outputHash: sha256(outputText),
          attempts: attempt,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    opts.onReject?.(attempt, rejections);
    feedback =
      "\n\n---\n## 上一次生成被系统拒绝，原因如下，请修正后重新生成：\n" +
      rejections.map((r) => `- [${r.reason}] ${r.detail}`).join("\n");
  }

  console.error(`[ai:${provider.name}] ${maxAttempts} 次尝试都未通过校验`);
  return null;
}
