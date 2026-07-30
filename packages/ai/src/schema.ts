/**
 * AI 三路意见的输出结构
 *
 * ⚠️ 注意这个 schema 里**没有任何金额字段**。
 * 这不是遗漏，是设计：AI 在结构上就不可能输出金额，
 * 所以"AI 不决定钱"这条不需要靠事后检查，靠的是它根本没有那个字段。
 *
 * 金额由 @sla/rules 的规则引擎按事前承诺的 weightBps 算出。
 */

import type { AiRole } from "@sla/domain";

export const PROMPT_VERSION = "ai-arguments-v1";

export const AI_ROLES: readonly AiRole[] = ["prosecution", "defense", "audit"];

/** 传给 Claude 的 JSON Schema。结构化输出保证返回值一定符合它。 */
export const AI_ARGUMENTS_SCHEMA = {
  type: "object",
  properties: {
    arguments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: {
            type: "string",
            enum: ["prosecution", "defense", "audit"],
            description: "意见角色",
          },
          text: {
            type: "string",
            description:
              "中文意见正文，2–4 句。每一处事实主张后面用方括号标注证据编号，如 [E2]。不得出现任何金额或分账建议。",
          },
          cites: {
            type: "array",
            items: { type: "string" },
            description:
              "本条意见引用的证据编号，如 [\"E1\",\"E2\"]。**不得为空**，且必须是输入里真实存在的编号。",
          },
          uncertain: {
            type: "array",
            items: { type: "string" },
            description:
              "明确标注为无法确定的条款编号。输入中所有 undecidable 的条款都必须出现在这里。",
          },
        },
        required: ["role", "text", "cites", "uncertain"],
        additionalProperties: false,
      },
    },
  },
  required: ["arguments"],
  additionalProperties: false,
} as const;

/** 校验失败的原因 */
export type AiRejectReason =
  | "MISSING_ROLE"
  | "DUPLICATE_ROLE"
  | "EMPTY_CITES"
  | "UNKNOWN_CITE"
  | "UNKNOWN_UNCERTAIN"
  | "MISSING_UNDECIDABLE"
  | "AMOUNT_IN_TEXT";

export interface AiRejection {
  reason: AiRejectReason;
  detail: string;
}

/** 生成过程的溯源信息，进案件证据用 */
export interface AiProvenance {
  model: string;
  promptVersion: string;
  /** 输入证据与判定的规范化哈希，用于复算 */
  inputHash: string;
  /** 输出的规范化哈希 */
  outputHash: string;
  /** 第几次尝试成功的（被拒绝会重试） */
  attempts: number;
  generatedAt: string;
}
