/**
 * 土豆案 - Demo 的标准样例数据
 *
 * 用户用 0.2 MON 要一只橙色猫，Agent 交付了一颗土豆，
 * 并解释“这是对猫这一概念的后现代重构”。
 *
 * C4“是一只猫”必须保持 undecidable。
 * 那是 Demo 的高潮，不是待修的 bug，任何人不许把它优化掉。
 */

import type { Case } from "../case.js";
import { SCHEMA_VERSION } from "../case.js";

export const POTATO_CASE: Case = {
  schemaVersion: SCHEMA_VERSION,
  caseNo: "SLA-2026-0001",
  title: "橙色猫插画交付争议",
  status: "RulingProposed",
  client: "0x1111111111111111111111111111111111111111",
  agent: "agent://illustrator-01",
  createdAt: "2026-08-01T09:00:00Z",
  isMock: true,

  requirements: [
    {
      id: "C1",
      type: "objective",
      check: "delivered_before_deadline",
      expect: "2026-08-01T12:00:00Z",
      label: "在 8 月 1 日 12:00 前交付",
      weightBps: 2500,
    },
    {
      id: "C2",
      type: "objective",
      check: "file_format",
      expect: "PNG",
      label: "文件格式为 PNG",
      weightBps: 2500,
    },
    {
      id: "C3",
      type: "objective",
      check: "has_alpha",
      expect: true,
      label: "背景透明",
      weightBps: 2500,
    },
    {
      id: "C4",
      type: "subjective",
      check: "depicts_a_cat",
      expect: true,
      label: "画的是一只适合儿童产品的橙色猫",
      weightBps: 2500,
    },
  ],

  evidence: [
    {
      id: "E1",
      kind: "requirement_hash",
      source: "offchain",
      label: "原始需求与验收条件",
      ts: "2026-08-01T09:00:00Z",
      hash: "0xreq0000000000000000000000000000000000000000000000000000000000001",
      text: "画一只适合儿童产品的橙色猫，背景透明，PNG 格式，今天中午 12 点前交付。",
    },
    {
      id: "E2",
      kind: "delivery",
      source: "offchain",
      label: "Agent 交付物与说明",
      ts: "2026-08-01T11:42:00Z",
      hash: "0xdel0000000000000000000000000000000000000000000000000000000000002",
      text: "potato.png（PNG，含 alpha 通道）。Agent 附言：这是对猫这一概念的后现代重构。",
      delivery: {
        fileName: "potato.png",
        mimeType: "image/png",
        hasAlpha: true,
        byteSize: 184_320,
        submittedAt: "2026-08-01T11:42:00Z",
        parsedBy: "png-parser-v1",
      },
    },
    {
      id: "E3",
      kind: "moss_pre_sign_explanation",
      source: "moss",
      label: "Moss 签前证据（创建任务）",
      ts: "2026-08-01T09:00:00Z",
      mossPreSign: {
        explanation:
          "你将创建一个 Agent 委托任务，并把 0.2 MON 锁入托管合约。资金在验收通过或仲裁结算前不会释放。若对方未按约定交付，可发起争议。",
        chainId: 10143,
        rpcFingerprint: "https://testnet-rpc.monad.xyz",
        mossCommit: "PENDING",
        protocolVersion: "silicon-arbitration@0.1.0",
        contractAddress: "PENDING",
        abiHash:
          "0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5",
        capabilityParams: {
          requirementsHash:
            "0xreq0000000000000000000000000000000000000000000000000000000000001",
          deadline: "2026-08-01T12:00:00Z",
          amount: "0.2",
        },
        unsignedTx: {
          from: "0x1111111111111111111111111111111111111111",
          to: "PENDING",
          data: "PENDING",
          value: "200000000000000000",
          chainId: 10143,
        },
        simulation: {
          receipt: { status: "PENDING" },
          warnings: [],
        },
        semantics: {
          domainAction: "commission",
          mossCoordinate: { protocol: "silicon-arbitration", method: "createTask" },
          mossVerb: "transfer",
          semanticMappingVersion: "create-task-v1",
          semanticFidelity: "coarse-verb",
          tags: ["task-creation", "escrow", "agent-work", "arbitration"],
        },
        canonicalPayloadHash: "PENDING",
      },
    },
  ],

  ruleResults: [
    { id: "C1", verdict: "satisfied", basis: ["E2"] },
    { id: "C2", verdict: "satisfied", basis: ["E2"] },
    { id: "C3", verdict: "satisfied", basis: ["E2"] },
    {
      id: "C4",
      verdict: "undecidable",
      basis: [],
      reason: "主观条件，确定性规则层无法判定。转人工复核。",
    },
  ],

  aiArguments: [
    {
      role: "prosecution",
      text:
        "交付物文件名为 potato.png，Agent 附言亦称其为“对猫这一概念的后现代重构”[E2]，画面主体明显偏离“猫”的约定。主 Agent 在需求转译时已将“适合儿童产品”压缩为“儿童向配色”，造成关键约束丢失[E1]。C4 无法由规则层自动裁决。",
      cites: ["E1", "E2"],
      uncertain: ["C4"],
    },
    {
      role: "defense",
      text:
        "客观验收项 C1、C2、C3 均已满足，交付时间为 11:42，文件格式 PNG 且含透明通道[E2]。原始需求中“适合儿童产品”与“猫”均属主观描述，事前未约定风格边界或相似度阈值，存在解释空间[E1]。C4 仍待人工判定。",
      cites: ["E1", "E2"],
      uncertain: ["C4"],
    },
    {
      role: "audit",
      text:
        "委托人签前已获资金托管与争议机制告知[E3]。插画 Agent 在生成时已被提示“主体相似度偏低”，却未回退或提请人工确认，而是直接交付[E2]。缺少依据表明委托人在最终输出前曾审阅过草图或中间版本。",
      cites: ["E2", "E3"],
      uncertain: ["C4"],
    },
  ],

  responsibilityChain: [
    {
      id: "H1",
      actor: "委托人",
      actorRole: "human",
      authority: "自有资金 0.2 MON",
      sawWarning: null,
      action: "提出需求：适合儿童产品的橙色猫，透明背景，PNG，12:00 前交付",
      ts: "2026-08-01T09:00:00Z",
      evidenceRefs: ["E1", "E3"],
    },
    {
      id: "H2",
      actor: "主 Agent",
      actorRole: "orchestrator",
      authority: "预算 0.2 MON，截止 12:00",
      sawWarning: null,
      action: "将需求转译为“橙色猫科动物主题插画，儿童向配色”并派发",
      ts: "2026-08-01T09:04:00Z",
      evidenceRefs: ["E1"],
      intentDrift: "“适合儿童产品”被压缩为“儿童向配色”，产品用途约束丢失",
    },
    {
      id: "H3",
      actor: "插画 Agent",
      actorRole: "worker",
      authority: "仅生成图像，无资金权限",
      sawWarning: "生成结果与提示词主体相似度偏低",
      action: "忽略相似度警告，继续生成并交付 potato.png",
      ts: "2026-08-01T11:40:00Z",
      evidenceRefs: ["E2"],
      intentDrift: "主体从“猫”漂移为“土豆”，且以风格解释合理化",
    },
    {
      id: "H4",
      actor: "图像工具",
      actorRole: "tool",
      authority: "按收到的参数执行",
      sawWarning: null,
      action: "输出 PNG，含 alpha 通道，符合格式参数",
      ts: "2026-08-01T11:41:00Z",
      evidenceRefs: ["E2"],
    },
    {
      id: "H5",
      actor: "钱包",
      actorRole: "wallet",
      authority: "用户签名授权",
      sawWarning: null,
      action: "签署并广播创建任务交易，资金进入托管",
      ts: "2026-08-01T09:01:00Z",
      evidenceRefs: ["E3"],
    },
  ],

  settlementProposal: {
    toAgent: "0.15",
    toClient: "0",
    frozen: "0.05",
  },

  onchain: {
    chainId: 10143,
    taskEscrowAddress: "0x67040374b8A9756586De0885f01d1291cE8FFCcF",
    createTaskAbiHash:
      "0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5",
    deadline: "2026-08-01T12:00:00Z",
    amount: "0.2",
    confirmed: false,
    deploymentTxHash:
      "0xb96eecedc5038735c40aa9918c3369f829bb3b93468d38b3b66f87ce9e896e34",
    deploymentBlockNumber: 49534792,
  },
};

/** 一键重置：每次拿到全新的深拷贝，Demo 可以反复跑 */
export function freshPotatoCase(): Case {
  return structuredClone(POTATO_CASE);
}
