/**
 * 案件领域数据结构（唯一事实源）
 *
 * AGENTS.md 约定：UI、规则引擎、链上集成三条线共用这一套定义，
 * 不允许各自再定义一份竞争版本。
 *
 * 分层原则：
 *   - 链下字段（requirements / evidence / ruleResults / aiArguments / responsibilityChain）
 *     由 Riso 定义，现在就冻结，可以直接开发。
 *   - 链上字段集中在 `onchain`，等 Neo 冻结合约接口（docs/06 P0-7、Gate 3）后再补齐。
 */

import type { CaseStatus } from "./status.js";

export const SCHEMA_VERSION = "case-v1";

// ────────────────────────────────────────────────────────────
// 验收条件
// ────────────────────────────────────────────────────────────

/**
 * objective  —— 规则层可客观判定，可以动钱
 * subjective —— 规则层一律输出 undecidable，转人工。这是立场，不是偷懒。
 */
export type RequirementType = "objective" | "subjective";

export interface Requirement {
  /** C1、C2、C3… 全局唯一，UI 与 AI 引用都用它 */
  id: string;
  type: RequirementType;
  /** 机器可判的检查名，如 delivered_before_deadline / file_format / has_alpha */
  check: string;
  /** 期望值 */
  expect: unknown;
  /** 人类可读描述，UI 直接显示 */
  label: string;
  /**
   * 该条款占总金额的权重，单位基点（1 bps = 0.01%，全部条款之和必须 = 10000）。
   *
   * ⚠️ 必须在 createTask **之前**确定，并随 canonical requirements 一起被
   * `requirementsHash` 承诺上链。争议发生后不得由 AI 或规则引擎临时改动——
   * 否则"金额可复算"这一主张就不成立了。
   */
  weightBps: number;
}

/** 权重总和必须等于 10000 bps */
export const TOTAL_WEIGHT_BPS = 10_000;

// ────────────────────────────────────────────────────────────
// 证据
// ────────────────────────────────────────────────────────────

export type EvidenceKind =
  | "requirement_hash" // 原始需求哈希
  | "delivery" // 交付物
  | "moss_pre_sign_explanation" // E3：Moss 签前证据
  | "onchain_receipt" // 链上回执
  | "direct_tx"; // Direct 路径的普通交易证据

/**
 * 证据来源。**不允许伪装**：
 * Direct 路径产生的交易证据不得标成 "moss"，
 * 否则违反 docs/08 的边界约定，也会让 Demo 口径失真。
 */
export type EvidenceSource = "moss" | "direct" | "offchain";

export interface Evidence {
  /** E1、E2、E3… AI 意见的 cites 必须引用这里的 id */
  id: string;
  kind: EvidenceKind;
  source: EvidenceSource;
  /** 人类可读描述，UI 直接显示 */
  label: string;
  /** ISO 8601 */
  ts: string;
  hash?: string;
  text?: string;
  txHash?: string;
  /** kind === "moss_pre_sign_explanation" 时必填 */
  mossPreSign?: MossPreSignEvidence;
  /** kind === "delivery" 时必填：交付物的机器可读事实 */
  delivery?: DeliveryFacts;
}

/**
 * 交付物的结构化事实。
 *
 * 规则引擎只读这里，**不读 `text` 里的自然语言描述**——
 * 「规则引擎不是另一个 AI」这句话的落地方式就是：它只吃结构化输入。
 *
 * 这些字段必须由固定的解析器产生，且可重放：
 *   - mimeType / hasAlpha 来自**字节解析**，不能靠文件扩展名
 *   - submittedAt 必须来自链上 `DeliverySubmitted` 的 block timestamp，
 *     **不能用客户端时钟**（客户端时钟可以伪造，链上时间不行）
 */
export interface DeliveryFacts {
  fileName: string;
  /** 由字节解析得出，如 "image/png" */
  mimeType: string;
  /** PNG alpha 通道是否存在且被使用 */
  hasAlpha: boolean;
  byteSize: number;
  /** 链上 DeliverySubmitted 的 block timestamp，ISO 8601 */
  submittedAt: string;
  /** 解析器版本，用于复算时锁定行为 */
  parsedBy: string;
}

// ────────────────────────────────────────────────────────────
// E3：Moss 签前证据
// ────────────────────────────────────────────────────────────

export interface UnsignedTx {
  from: string;
  to: string;
  data: string;
  value: string;
  chainId: number;
}

/**
 * 语义映射。Moss 现有闭集里只有粗粒度的 transfer，
 * 不等于业务语义 commission —— 这层损失必须显式记录，不得伪装成等价。
 * 见 docs/08 第 5.3 节。
 */
export interface MossSemanticMapping {
  domainAction: "commission";
  mossCoordinate: { protocol: string; method: string };
  mossVerb: string;
  semanticMappingVersion: string;
  semanticFidelity: "coarse-verb" | "exact";
  tags: string[];
}

/**
 * E3 不是一段解释文本。
 * 它是一份可重算、可追溯的结构化签前证据。
 */
export interface MossPreSignEvidence {
  /** 用户在签名前实际看到的解释原文，必须与 UI 展示逐字一致 */
  explanation: string;
  chainId: number;
  rpcFingerprint: string;
  mossCommit: string;
  protocolVersion: string;
  contractAddress: string;
  abiHash: string;
  capabilityParams: Record<string, unknown>;
  unsignedTx: UnsignedTx;
  simulation: {
    receipt: unknown;
    warnings: string[];
  };
  semantics: MossSemanticMapping;
  /** 上述内容的规范化哈希，用于事后重算比对 */
  canonicalPayloadHash: string;
  /** 钱包实际请求签名的交易与 Moss 未签交易是否逐字段一致 */
  walletConsistency?: {
    matched: boolean;
    mismatchFields?: string[];
  };
  /** 广播之后才有 */
  broadcast?: {
    txHash: string;
    blockNumber: number;
    events: unknown[];
  };
}

// ────────────────────────────────────────────────────────────
// 规则判定
// ────────────────────────────────────────────────────────────

/**
 * undecidable 是一等公民，不是失败。
 * 主观条件永远返回它，并且必须给出 reason。
 */
export type Verdict = "satisfied" | "violated" | "undecidable";

export interface RuleResult {
  /** 对应 Requirement.id */
  id: string;
  verdict: Verdict;
  /** 依据的证据编号，如 ["E2"] */
  basis: string[];
  /** verdict === "undecidable" 时必填 */
  reason?: string;
}

// ────────────────────────────────────────────────────────────
// AI 三路意见
// ────────────────────────────────────────────────────────────

export type AiRole = "prosecution" | "defense" | "audit";

export const AI_ROLE_LABEL: Record<AiRole, string> = {
  prosecution: "检方意见",
  defense: "辩方意见",
  audit: "审计意见",
};

export interface AiArgument {
  role: AiRole;
  text: string;
  /** 必须非空。cites 为空的意见会被系统拒绝并重试。 */
  cites: string[];
  /** 明确标注为不确定的条款编号 */
  uncertain: string[];
}

// ────────────────────────────────────────────────────────────
// 结算
// ────────────────────────────────────────────────────────────

/**
 * 金额一律用十进制字符串（单位 MON），不要用 number —— 会丢精度。
 * 由规则层计算，**AI 不得决定金额**。
 */
export interface SettlementProposal {
  toAgent: string;
  toClient: string;
  /** 对应 undecidable 条款的冻结部分，等人类终审 */
  frozen: string;
}

// ────────────────────────────────────────────────────────────
// 责任链
// ────────────────────────────────────────────────────────────

export type ActorRole = "human" | "orchestrator" | "worker" | "tool" | "wallet";

export const ACTOR_ROLE_LABEL: Record<ActorRole, string> = {
  human: "人类",
  orchestrator: "主 Agent",
  worker: "子 Agent",
  tool: "工具",
  wallet: "钱包",
};

/**
 * 责任链的一跳。四个字段对应 UI 卡片的四栏：
 * 谁 / 什么授权 / 看见了什么警告 / 做了什么
 */
export interface ChainHop {
  /** H1、H2… */
  id: string;
  actor: string;
  actorRole: ActorRole;
  /** 获得了什么授权 */
  authority: string;
  /** 看见了什么警告；null = 没有警告 */
  sawWarning: string | null;
  /** 做了什么 */
  action: string;
  ts: string;
  /** 关联证据编号 */
  evidenceRefs: string[];
  /** 与上一跳相比，意图是否发生偏移 —— 责任流失量的可视化依据 */
  intentDrift?: string;
}

// ────────────────────────────────────────────────────────────
// 链上引用（⚠️ 待冻结）
// ────────────────────────────────────────────────────────────

/**
 * ⚠️ 待 Neo 冻结合约接口后补齐（docs/06 P0-7，Gate 3）。
 * 字段名与类型都可能变，**UI 不要依赖这里的细节**，
 * 只把它当作"链上有对应记录"的占位。
 */
export interface OnchainRefs {
  taskId?: string;
  caseId?: string;
  requirementsHash?: string;
  deliveryHash?: string;
  /** ISO 8601 */
  deadline?: string;
  /** 十进制字符串，单位 MON */
  amount?: string;
  /** 是否已在链上确认 */
  confirmed: boolean;
}

// ────────────────────────────────────────────────────────────
// 案件
// ────────────────────────────────────────────────────────────

export interface Case {
  schemaVersion: typeof SCHEMA_VERSION;
  /** 卷宗编号，UI 显示用，如 SLA-2026-0001 */
  caseNo: string;
  title: string;
  status: CaseStatus;
  /** 委托人钱包地址 */
  client: string;
  /** 承接 Agent 标识 */
  agent: string;
  createdAt: string;

  requirements: Requirement[];
  evidence: Evidence[];
  ruleResults: RuleResult[];
  aiArguments: AiArgument[];
  responsibilityChain: ChainHop[];
  settlementProposal: SettlementProposal | null;

  onchain: OnchainRefs;

  /** true = 演示用假数据，UI 必须显著标注（AGENTS.md 不变量 5） */
  isMock: boolean;
}

// ────────────────────────────────────────────────────────────
// 小工具
// ────────────────────────────────────────────────────────────

export function findEvidence(c: Case, id: string): Evidence | undefined {
  return c.evidence.find((e) => e.id === id);
}

export function findRequirement(c: Case, id: string): Requirement | undefined {
  return c.requirements.find((r) => r.id === id);
}

export function findRuleResult(c: Case, id: string): RuleResult | undefined {
  return c.ruleResults.find((r) => r.id === id);
}

/** 是否存在不可自动裁决的条款 —— 决定裁决页是否出现空章位 */
export function hasUndecidable(c: Case): boolean {
  return c.ruleResults.some((r) => r.verdict === "undecidable");
}

/** 全部不可裁决的条款编号 */
export function undecidableIds(c: Case): string[] {
  return c.ruleResults.filter((r) => r.verdict === "undecidable").map((r) => r.id);
}
