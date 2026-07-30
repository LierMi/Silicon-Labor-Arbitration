/**
 * 供应商配置
 *
 * GonkaRouter 兼容 Anthropic Messages API，所以 SDK 不用换，
 * 只改 baseURL + 模型 ID。但有两处能力差异必须区分对待：
 *
 *   1. **结构化输出**（`output_config.format`）—— Gonka 文档未提供，按不支持处理。
 *      改为在 prompt 里要求纯 JSON，靠容错解析 + 校验重试兜底。
 *   2. **adaptive thinking / effort** —— Anthropic 专有参数，Gonka 上的开源模型不认。
 *      发过去可能报错，所以只在 Anthropic 路径上带。
 *
 * 校验器（cites 非空、不得谈钱、必须标注 undecidable）两条路径共用——
 * 那是产品不变量，跟谁家的模型无关。
 */

import Anthropic from "@anthropic-ai/sdk";

export type ProviderName = "gonka" | "anthropic";

export interface ProviderConfig {
  name: ProviderName;
  client: Anthropic;
  model: string;
  /** 是否支持 output_config.format 结构化输出 */
  structuredOutput: boolean;
  /** 是否支持 thinking / effort */
  thinking: boolean;
}

const GONKA_DEFAULT_BASE = "https://api.gonkarouter.io";
const GONKA_DEFAULT_MODEL = "moonshotai/Kimi-K2.6";
const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5";

/**
 * ⚠️ SDK 会自己在 baseURL 后面拼 `/v1/messages`。
 * 所以 baseURL 要写到主机名为止——写成 `.../v1` 会变成 `/v1/v1/messages` 打不通。
 * 这里做个兜底：末尾的 `/v1` 自动剥掉，两种写法都能用。
 */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/v1$/, "");
}

/**
 * 按环境变量选供应商：
 *   GONKA_API_KEY     → 走 Gonka（有免费额度，默认）
 *   ANTHROPIC_API_KEY → 走 Anthropic
 * 两个都没有则抛错。
 */
export function resolveProvider(override?: Partial<ProviderConfig>): ProviderConfig {
  if (override?.client && override.model) return override as ProviderConfig;

  const gonkaKey = process.env["GONKA_API_KEY"];
  if (gonkaKey) {
    const baseURL = normalizeBaseUrl(
      process.env["GONKA_BASE_URL"] ?? GONKA_DEFAULT_BASE,
    );
    return {
      name: "gonka",
      client: new Anthropic({ apiKey: gonkaKey, baseURL }),
      model: process.env["GONKA_MODEL"] ?? GONKA_DEFAULT_MODEL,
      structuredOutput: false,
      thinking: false,
      ...override,
    };
  }

  if (process.env["ANTHROPIC_API_KEY"]) {
    return {
      name: "anthropic",
      client: new Anthropic(),
      model: process.env["ANTHROPIC_MODEL"] ?? ANTHROPIC_DEFAULT_MODEL,
      structuredOutput: true,
      thinking: true,
      ...override,
    };
  }

  throw new Error(
    "没有找到可用的凭证：请设置 GONKA_API_KEY（推荐，有免费额度）或 ANTHROPIC_API_KEY",
  );
}
