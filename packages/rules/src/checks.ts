/**
 * 确定性检查器
 *
 * 每个检查器是一个**纯函数**：同样的输入永远得到同样的输出，
 * 不联网、不调模型、不看时钟。这样任何人都能拿同一份证据复算出同一个结果。
 *
 * 这就是「规则引擎不是另一个 AI」的具体含义。
 */

import type { Case, DeliveryFacts, Requirement, Verdict } from "@sla/domain";

export const CHECKER_VERSION = "checks-v1";

export interface CheckOutcome {
  verdict: Verdict;
  /** 依据的证据编号 */
  basis: string[];
  /** verdict 为 undecidable 时必须说明卡在哪 */
  reason?: string;
  /** 人类可读的判定依据，UI 可以显示在条款下方 */
  detail?: string;
}

export interface CheckContext {
  requirement: Requirement;
  /** 交付证据的编号与事实；没有交付时为 null */
  delivery: { evidenceId: string; facts: DeliveryFacts } | null;
}

export type Checker = (ctx: CheckContext) => CheckOutcome;

/** 缺少交付事实时的统一处理：判不了，而不是判违约 */
function needDelivery(reason = "尚无交付物的结构化事实"): CheckOutcome {
  return { verdict: "undecidable", basis: [], reason };
}

/**
 * C1：是否在截止时间前交付
 * 时间基准必须是链上 block timestamp，不是客户端时钟。
 */
const deliveredBeforeDeadline: Checker = ({ requirement, delivery }) => {
  if (!delivery) return needDelivery();
  const deadline = Date.parse(String(requirement.expect));
  const submitted = Date.parse(delivery.facts.submittedAt);
  if (Number.isNaN(deadline) || Number.isNaN(submitted)) {
    return {
      verdict: "undecidable",
      basis: [delivery.evidenceId],
      reason: "截止时间或交付时间不是合法时间格式",
    };
  }
  const ok = submitted <= deadline;
  return {
    verdict: ok ? "satisfied" : "violated",
    basis: [delivery.evidenceId],
    detail: `交付于 ${delivery.facts.submittedAt}，截止 ${requirement.expect}`,
  };
};

/**
 * C2：文件格式
 * 比对的是字节解析出来的 mimeType，不是文件扩展名——扩展名可以随便改。
 */
const fileFormat: Checker = ({ requirement, delivery }) => {
  if (!delivery) return needDelivery();
  const expectMime = String(requirement.expect).toLowerCase() === "png"
    ? "image/png"
    : String(requirement.expect).toLowerCase();
  const actual = delivery.facts.mimeType.toLowerCase();
  return {
    verdict: actual === expectMime ? "satisfied" : "violated",
    basis: [delivery.evidenceId],
    detail: `字节解析得到 ${delivery.facts.mimeType}（解析器 ${delivery.facts.parsedBy}）`,
  };
};

/** C3：背景是否透明（PNG alpha 通道） */
const hasAlpha: Checker = ({ requirement, delivery }) => {
  if (!delivery) return needDelivery();
  const expected = requirement.expect === true;
  return {
    verdict: delivery.facts.hasAlpha === expected ? "satisfied" : "violated",
    basis: [delivery.evidenceId],
    detail: delivery.facts.hasAlpha ? "检测到 alpha 通道" : "未检测到 alpha 通道",
  };
};

/** 检查器注册表。没有登记的 check 名一律 undecidable，不猜。 */
export const CHECKERS: Record<string, Checker> = {
  delivered_before_deadline: deliveredBeforeDeadline,
  file_format: fileFormat,
  has_alpha: hasAlpha,
};

/** 从案件里取出交付事实 */
export function extractDelivery(c: Case): CheckContext["delivery"] {
  const e = c.evidence.find((x) => x.kind === "delivery" && x.delivery);
  return e?.delivery ? { evidenceId: e.id, facts: e.delivery } : null;
}
