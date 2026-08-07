import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildArgumentPresentation,
  buildArchiveSummary,
  buildEvidenceConnectionIndex,
  buildProofBundle,
  caseRuntimeLabel,
  caseStatusLabel,
  deliveryTimingLabel,
  formatCaseTime,
  monadExplorerUrl,
  parseActHash,
  parseStoredReview,
  reviewStorageKey,
} from "./case-presentation.js";
import { freshPotatoCase } from "@sla/domain";

describe("case presentation derives copy from evidence", () => {
  it("formats fixture timestamps in explicit Beijing time", () => {
    assert.equal(formatCaseTime("2026-08-05T15:52:29Z"), "8月5日 23:52");
  });

  it("derives delivery timing instead of hard-coding 11:42", () => {
    assert.equal(
      deliveryTimingLabel("2026-08-05T15:52:29Z", "2026-08-05T16:10:29Z"),
      "23:52 · 早于截止 18 分钟",
    );
  });

  it("does not call an unconfirmed fixture connected or escrowed", () => {
    assert.equal(caseRuntimeLabel(false), "固化演示 · 案件未广播");
    assert.equal(caseRuntimeLabel(true), "Monad Testnet · 链上已确认");
  });

  it("describes the unresolved rule state without claiming a final verdict", () => {
    assert.equal(caseStatusLabel(), "规则判定已生成 · C4 人工未决");
  });

  it("parses shareable act hashes defensively", () => {
    assert.equal(parseActHash("#act=4", 6), 3);
    assert.equal(parseActHash("#act=99", 6), 5);
    assert.equal(parseActHash("#garbage", 6), 0);
  });

  it("only restores complete local human review records", () => {
    assert.equal(reviewStorageKey("SLA-2026-0001"), "sla:review:SLA-2026-0001");
    assert.deepEqual(
      parseStoredReview(JSON.stringify({ decision: "breach", reason: "核心条款没有履行", reviewer: "Emily", role: "委托人复核" })),
      { decision: "breach", reason: "核心条款没有履行", reviewer: "Emily", role: "委托人复核" },
    );
    assert.equal(parseStoredReview("{}"), null);
  });

  it("builds explorer links only for real deployment records", () => {
    assert.equal(
      monadExplorerUrl("tx", "0xabc"),
      "https://testnet.monadexplorer.com/tx/0xabc",
    );
    assert.equal(
      monadExplorerUrl("address", "0xdef"),
      "https://testnet.monadexplorer.com/address/0xdef",
    );
    assert.equal(monadExplorerUrl("tx", undefined), null);
  });

  it("exports an honest proof bundle without inventing a case transaction", () => {
    const caseFile = freshPotatoCase();
    const bundle = buildProofBundle(caseFile);

    assert.equal(bundle.schema, "sla-proof-bundle/v1");
    assert.equal(bundle.case.caseNo, caseFile.caseNo);
    assert.equal(bundle.chain.caseBroadcast, false);
    assert.equal(bundle.chain.deploymentTxHash, caseFile.onchain.deploymentTxHash);
    assert.equal(bundle.evidence.find((item) => item.id === "E2")?.sha256, caseFile.evidence[1]?.asset?.sha256);
    assert.equal("caseTxHash" in bundle.chain, false);
  });

  it("builds bidirectional evidence connections across responsibility, rules, and AI opinions", () => {
    const caseFile = freshPotatoCase();
    const index = buildEvidenceConnectionIndex(caseFile);

    assert.deepEqual(index.E2, {
      id: "E2",
      label: caseFile.evidence[1]?.label,
      chainHopIds: ["H5"],
      ruleIds: ["C1", "C2", "C3"],
      argumentRoles: ["prosecution", "defense"],
    });
    assert.deepEqual(index.E5, {
      id: "E5",
      label: caseFile.evidence[4]?.label,
      chainHopIds: ["H4", "H5"],
      ruleIds: [],
      argumentRoles: ["audit"],
    });
  });

  it("summarizes the archive without turning an unresolved rule into a verdict", () => {
    const summary = buildArchiveSummary(freshPotatoCase());

    assert.deepEqual(summary, {
      evidenceCount: 5,
      chainHopCount: 5,
      satisfiedRuleIds: ["C1", "C2", "C3"],
      unresolvedRuleIds: ["C4"],
      frozenAmount: "0.2",
      humanReviewRequired: true,
    });
  });

  it("keeps role focus and evidence focus as separate presentation signals", () => {
    const argumentsForDisplay = [
      { role: "prosecution" as const, cites: ["E1", "E2"] },
      { role: "defense" as const, cites: ["E2"] },
      { role: "audit" as const, cites: ["E3", "E5"] },
    ];

    assert.deepEqual(buildArgumentPresentation(argumentsForDisplay, "defense", "E2"), {
      layoutClass: "has-active is-focus-defense",
      items: {
        prosecution: { isActive: false, isRoleMuted: true, isEvidenceMuted: false },
        defense: { isActive: true, isRoleMuted: false, isEvidenceMuted: false },
        audit: { isActive: false, isRoleMuted: true, isEvidenceMuted: true },
      },
    });
  });
});
