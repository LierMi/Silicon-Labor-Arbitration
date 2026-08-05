/**
 * 土豆案 —— Demo 的标准样例数据
 *
 * 用户付 0.2 MON 要一只橙色的猫，Agent 交付了一颗土豆，
 * 并解释"这是对猫这一概念的后现代重构"。
 *
 * ⚠️ C4「是一只猫」必须保持 undecidable。
 *    那是 Demo 的高潮，不是待修的 bug，任何人不许把它优化掉。
 */

import type { Case, Requirement } from "../case.js";
import { SCHEMA_VERSION } from "../case.js";
import { computeRequirementsHash } from "../canonical.js";

/**
 * 验收条件。**单独抽出来是为了让 requirementsHash 能算出来，而不是抄进来。**
 * 硬编码一个哈希值，等于给"条款被承诺过"这件事留了个可以撒谎的口子。
 */
export const POTATO_REQUIREMENTS: Requirement[] = [
    {
      id: "C1",
      type: "objective",
      check: "delivered_before_deadline",
      expect: "2026-08-01T12:00:00Z",
      label: "在 8 月 1 日 12:00 前交付",
      weightBps: 2500,
      essential: false,
    },
    {
      id: "C2",
      type: "objective",
      check: "file_format",
      expect: "PNG",
      label: "文件格式为 PNG",
      weightBps: 2500,
      essential: false,
    },
    {
      id: "C3",
      type: "objective",
      check: "has_alpha",
      expect: true,
      label: "背景透明",
      weightBps: 2500,
      essential: false,
    },
    {
      id: "C4",
      type: "subjective",
      check: "depicts_a_cat",
      expect: true,
      label: "画的是一只适合儿童产品的橙色猫",
      weightBps: 2500,
      essential: true,
    },
];

/**
 * 土豆案的 requirementsHash —— **由上面的条款真实算出**。
 *
 * 改动任何一条条款（含 weightBps、essential），这个值都会跟着变，
 * 于是 fixture 里的链上引用和 Moss 参数自动同步。想事后偷改条款
 * 又让哈希对得上，做不到。
 */
export const POTATO_REQUIREMENTS_HASH = computeRequirementsHash(POTATO_REQUIREMENTS);

export const POTATO_CASE: Case = {
  schemaVersion: SCHEMA_VERSION,
  caseNo: "SLA-2026-0001",
  title: "橙色猫插画交付争议",
  status: "RulingProposed",
  client: "0x1111111111111111111111111111111111111111",
  agent: "agent://illustrator-01",
  createdAt: "2026-08-01T09:00:00Z",
  isMock: true,

  // ── 验收条件 ────────────────────────────────────────────
  requirements: POTATO_REQUIREMENTS,

  // ── 证据 ────────────────────────────────────────────────
  evidence: [
    {
      id: "E1",
      kind: "requirement_hash",
      source: "offchain",
      label: "原始需求与验收条件",
      ts: "2026-08-01T09:00:00Z",
      // E1 就是"条款原文"这份证据，它的 hash 必须**等于**上链承诺的
      // requirementsHash——否则档案里的条款和链上承诺的不是同一份东西。
      hash: POTATO_REQUIREMENTS_HASH,
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
      // 规则引擎只读这里，不读上面的 text
      delivery: {
        fileName: "potato.png",
        mimeType: "image/png", // 由字节解析得出，不是看扩展名
        hasAlpha: true,
        byteSize: 184_320,
        submittedAt: "2026-08-01T11:42:00Z", // 应来自链上 DeliverySubmitted 的 block timestamp
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
        mossCommit: "PENDING", // 待 Neo 填入团队 Moss 基线 commit
        protocolVersion: "silicon-arbitration@0.1.0",
        contractAddress: "PENDING", // 待 Gate 4 部署后填入
        abiHash: "0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5",
        capabilityParams: {
          requirementsHash: POTATO_REQUIREMENTS_HASH,
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
        // 语义损失显式记录，不伪装成等价（docs/08 §5.3）
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

  // ── 规则判定 ────────────────────────────────────────────
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

  // ── AI 三路意见（真实生成后固化）────────────────────────
  //
  // ⚠️ 这不是手写的样例，是 @sla/ai 真实调用 Gonka 生成、通过全部校验后固化下来的。
  //    provider: gonka / model: moonshotai/Kimi-K2.6
  //    promptVersion: ai-arguments-v1
  //    inputHash: 7230915549dcbe1c…
  //    outputHash: 33b82e707d56ea76…
  //    generatedAt: 2026-07-30T13:29:28.696Z
  //
  // 路演当天读这份固化数据，**不现场调 API** —— 网络、额度、模型拒答
  // 任何一个出问题都会让 demo 卡在最关键的一页。
  // 要重新生成：packages/ai 里跑一次，把新结果替换到这里。
  aiArguments: [
    {
      role: "prosecution",
      text:
        "交付物文件名为 potato.png，Agent 附言亦称其为「对猫这一概念的后现代重构」[E2]，画面主体明显偏离「猫」的约定。主 Agent 在需求转译时已将「适合儿童产品」压缩为「儿童向配色」，造成关键约束丢失[E1]。C4 无法由规则层自动裁决。",
      cites: ["E1", "E2"],
      uncertain: ["C4"],
    },
    {
      role: "defense",
      text:
        "客观验收项 C1、C2、C3 均已满足，交付时间为 11:42，文件格式 PNG 且含透明通道[E2]。原始需求中「适合儿童产品」与「猫」均属主观描述，事前未约定风格边界或相似度阈值，存在解释空间[E1]。C4 仍待人工判定。",
      cites: ["E1", "E2"],
      uncertain: ["C4"],
    },
    {
      role: "audit",
      text:
        "委托人签前已获资金托管与争议机制告知[E3]。插画 Agent 在生成时已被提示「主体相似度偏低」，却未回退或提请人工确认，而是直接交付[E2]。缺少依据表明委托人在最终输出前曾审阅过草图或中间版本。",
      cites: ["E2", "E3"],
      uncertain: ["C4"],
    },
  ],

  // ── 责任链 ──────────────────────────────────────────────
  responsibilityChain: [
    {
      id: "H1",
      actor: "委托人",
      actorRole: "human",
      authority: "自有资金 0.2 MON",
      sawWarning: null,
      action: "提出需求：适合儿童产品的橙色猫，透明背景，PNG，12:00 前",
      ts: "2026-08-01T09:00:00Z",
      evidenceRefs: ["E1", "E3"],
    },
    {
      id: "H2",
      actor: "主 Agent",
      actorRole: "orchestrator",
      authority: "预算 0.2 MON，截止 12:00",
      sawWarning: null,
      action: "将需求转译为「橙色猫科动物主题插画，儿童向配色」并派发",
      ts: "2026-08-01T09:04:00Z",
      evidenceRefs: ["E1"],
      intentDrift: "「适合儿童产品」被压缩为「儿童向配色」，产品用途约束丢失",
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
      intentDrift: "主体从「猫」漂移为「土豆」，且以风格解释合理化",
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

  // ── 结算 ────────────────────────────────────────────────
  // 0.15 支付 + 0.05 冻结 = 0.2 MON。冻结部分对应 C4，等人类终审。
  // C4 是核心条款（essential）且不可裁决 → 全额冻结。
  //
  // 不是 0.15/0/0.05。按权重先付 75% 的前提是"条款可分割、价值可累加"，
  // 而一张按时交付、PNG、背景透明的**土豆**图，对委托人的价值是零——
  // 三条腿的桌子不值一张桌子的 75%。
  //
  // 规则引擎仍然算得出 0.15（见 essentialOverride.wouldHaveBeen），
  // 但它主动不动手。**能算，但克制**，这是 demo 要展示的东西。
  settlementProposal: {
    toAgent: "0",
    toClient: "0",
    frozen: "0.2",
  },

  // ── 链上引用（Gate 4 已部署 Monad Testnet）────────────
  onchain: {
    chainId: 10143,
    taskEscrowAddress: "0x67040374b8A9756586De0885f01d1291cE8FFCcF",
    createTaskAbiHash: "0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5",
    // ⚠️ 展示与规则比较用。**不要传给 createTask** —— 用 deadlineFromNow()。
    deadline: "2026-08-01T12:00:00Z",
    amount: "0.2",
    confirmed: false,
    deploymentTxHash: "0xb96eecedc5038735c40aa9918c3369f829bb3b93468d38b3b66f87ce9e896e34",
    deploymentBlockNumber: 49534792,
    // 由 POTATO_REQUIREMENTS 真实算出，不是占位值
    requirementsHash: POTATO_REQUIREMENTS_HASH,
  },
};

/** 一键重置：每次拿到全新的深拷贝，Demo 可以反复跑 */
export function freshPotatoCase(): Case {
  return structuredClone(POTATO_CASE);
}
