import type { Case } from "@sla/domain";

const BEIJING_TIME_ZONE = "Asia/Shanghai";
const MONAD_TESTNET_EXPLORER = "https://testnet.monadexplorer.com";

export function formatCaseTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("month")}月${value("day")}日 ${value("hour")}:${value("minute")}`;
}

export function deliveryTimingLabel(submittedAt: string, deadline: string): string {
  const deltaMinutes = Math.round((new Date(deadline).getTime() - new Date(submittedAt).getTime()) / 60_000);
  const relation = deltaMinutes >= 0 ? `早于截止 ${deltaMinutes} 分钟` : `晚于截止 ${Math.abs(deltaMinutes)} 分钟`;
  return `${formatCaseTime(submittedAt).split(" ")[1]} · ${relation}`;
}

export function caseRuntimeLabel(confirmed: boolean): string {
  return confirmed ? "Monad Testnet · 链上已确认" : "固化演示 · 案件未广播";
}

export function caseStatusLabel(): string {
  return "规则判定已生成 · C4 人工未决";
}

export function parseActHash(hash: string, count: number): number {
  const matched = /^#act=(\d+)$/.exec(hash);
  if (!matched || count <= 0) return 0;
  const requested = Number(matched[1]);
  if (!Number.isFinite(requested)) return 0;
  return Math.max(0, Math.min(count - 1, requested - 1));
}

export type StoredHumanReview = {
  decision: "breach" | "no-breach" | "keep-frozen";
  reason: string;
  reviewer: string;
  role: string;
};

export function reviewStorageKey(caseNo: string): string {
  return `sla:review:${caseNo}`;
}

export function parseStoredReview(raw: string | null): StoredHumanReview | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredHumanReview>;
    const decision = value.decision;
    const validDecision = decision === "breach" || decision === "no-breach" || decision === "keep-frozen";
    if (!validDecision || !value.reason || value.reason.trim().length < 8 || !value.reviewer?.trim() || !value.role?.trim()) return null;
    return {
      decision: decision!,
      reason: value.reason.trim(),
      reviewer: value.reviewer.trim(),
      role: value.role.trim(),
    };
  } catch {
    return null;
  }
}

export function monadExplorerUrl(kind: "tx" | "address", value?: string): string | null {
  return value ? `${MONAD_TESTNET_EXPLORER}/${kind}/${value}` : null;
}

export function buildProofBundle(caseFile: Case) {
  return {
    schema: "sla-proof-bundle/v1" as const,
    exportedAt: new Date().toISOString(),
    case: {
      caseNo: caseFile.caseNo,
      title: caseFile.title,
      status: caseFile.status,
      isFixture: caseFile.isMock,
      requirementsHash: caseFile.onchain.requirementsHash,
    },
    chain: {
      chainId: caseFile.onchain.chainId,
      caseBroadcast: caseFile.onchain.confirmed,
      taskEscrowAddress: caseFile.onchain.taskEscrowAddress,
      deploymentTxHash: caseFile.onchain.deploymentTxHash,
      deploymentExplorerUrl: monadExplorerUrl("tx", caseFile.onchain.deploymentTxHash),
      contractExplorerUrl: monadExplorerUrl("address", caseFile.onchain.taskEscrowAddress),
      truthNotice: caseFile.onchain.confirmed
        ? "案件状态已由链上记录确认。"
        : "合约部署记录真实；本案 createTask 未签名、未广播。",
    },
    evidence: caseFile.evidence.map((item) => ({
      id: item.id,
      kind: item.kind,
      source: item.source,
      timestamp: item.ts,
      evidenceHash: item.hash,
      fileName: item.asset?.fileName,
      sha256: item.asset?.sha256,
      byteSize: item.asset?.byteSize,
    })),
    ruleResults: caseFile.ruleResults,
    responsibilityChain: caseFile.responsibilityChain,
    settlementProposal: caseFile.settlementProposal,
  };
}

export type EvidenceConnection = {
  id: string;
  label: string;
  chainHopIds: string[];
  ruleIds: string[];
  argumentRoles: Array<"prosecution" | "defense" | "audit">;
};

export type ArgumentRole = "prosecution" | "defense" | "audit";

export function buildArgumentPresentation(
  argumentsForDisplay: Array<{ role: ArgumentRole; cites: string[] }>,
  activeRole: ArgumentRole | null,
  focusedEvidenceId: string | null,
) {
  return {
    layoutClass: activeRole ? `has-active is-focus-${activeRole}` : "",
    items: Object.fromEntries(argumentsForDisplay.map((argument) => [
      argument.role,
      {
        isActive: activeRole === argument.role,
        isRoleMuted: activeRole !== null && activeRole !== argument.role,
        isEvidenceMuted: focusedEvidenceId !== null && !argument.cites.includes(focusedEvidenceId),
      },
    ])) as Record<ArgumentRole, { isActive: boolean; isRoleMuted: boolean; isEvidenceMuted: boolean }>,
  };
}

export function buildEvidenceConnectionIndex(caseFile: Case): Record<string, EvidenceConnection> {
  const index: Record<string, EvidenceConnection> = {};
  caseFile.evidence.forEach((evidence) => {
    index[evidence.id] = {
      id: evidence.id,
      label: evidence.label,
      chainHopIds: [],
      ruleIds: [],
      argumentRoles: [],
    };
  });

  caseFile.responsibilityChain.forEach((hop) => {
    hop.evidenceRefs.forEach((evidenceId) => index[evidenceId]?.chainHopIds.push(hop.id));
  });
  caseFile.ruleResults.forEach((rule) => {
    rule.basis.forEach((evidenceId) => index[evidenceId]?.ruleIds.push(rule.id));
  });
  caseFile.aiArguments.forEach((argument) => {
    argument.cites.forEach((evidenceId) => index[evidenceId]?.argumentRoles.push(argument.role));
  });

  return index;
}

export function buildArchiveSummary(caseFile: Case) {
  return {
    evidenceCount: caseFile.evidence.length,
    chainHopCount: caseFile.responsibilityChain.length,
    satisfiedRuleIds: caseFile.ruleResults.filter((rule) => rule.verdict === "satisfied").map((rule) => rule.id),
    unresolvedRuleIds: caseFile.ruleResults.filter((rule) => rule.verdict === "undecidable").map((rule) => rule.id),
    frozenAmount: caseFile.settlementProposal?.frozen ?? "0",
    humanReviewRequired: caseFile.ruleResults.some((rule) => rule.verdict === "undecidable"),
  };
}
