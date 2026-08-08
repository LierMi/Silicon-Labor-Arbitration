/**
 * MossBridge — the only module in the product that talks to Moss directly.
 *
 * AGENTS.md § Target module seams:
 *   MossBridge.prepareTask(input)
 *     -> capability
 *     -> unsignedTransactions
 *     -> simulation
 *     -> preSignEvidence
 *
 * Callers must not depend on Moss Registry, decorators, Receipt internals,
 * or MCP transport details.
 */
import type { Address, UnsignedTx } from "@themoss/core";
import { Registry } from "@themoss/core";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createTraceSimulator } from "@themoss/simulator";
import { monadTestnetRuntime } from "@themoss/system";
import * as siliconArbitration from "@themoss/protocol-silicon-arbitration";
import type { MossRuntime } from "@themoss/core";
import { computeE3PayloadHash } from "@sla/domain";
import type { MossPreSignEvidence } from "@sla/domain";

/** Monad Testnet。写成常量，免得各处散落魔法数字。 */
const MONAD_TESTNET_CHAIN_ID = 10143;

// ────────────────────────────────────────────────────────────
// Stable product types (do NOT expose Moss internals)
// ────────────────────────────────────────────────────────────

export interface PreparedTask {
  /** The unsigned transaction the wallet must sign. */
  unsignedTransaction: {
    to: Address;
    data: string;
    value: string;
    from: Address;
  };
  /** Gas estimate from the live simulation. */
  estimatedGas: string;
  /** ❌ true if the simulation reverted or produced warnings. */
  simulationFailed: boolean;
  /** Warnings that the caller must surface before signing. */
  warnings: string[];
  /** The structured simulation result for E3 evidence. */
  evidenceHash: string | null;
  /** Raw receipt data for E3 canonical serialization. */
  receipt: unknown;
  /**
   * **实际传给 `registry.action()` 的参数原样快照。**
   *
   * ⚠️ 不接受调用方另行提供。原先 `buildE3` 从 `E3Provenance.capabilityParams`
   * 拿这份数据，于是归档的可以是任何东西——实际发给 Moss 的
   * `requirementsHash` 是十进制，归档的却是十六进制。
   *
   * 那样的哈希只能证明"内容后来没被改过"，不能证明"内容是真的"。
   * 证据要成立，归档的必须**就是**发出去的那一份。
   */
  capabilityParams: Record<string, unknown>;
  /**
   * **实际使用的 RPC 端点的去敏指纹。**
   *
   * 由创建 Runtime 的那一处生成，不由调用方提供——否则 E3 里写的端点
   * 可以和真正用的不是同一个。
   *
   * 去敏是硬性要求：`docs/05` 明确不得保存私密 RPC Key，
   * 而很多付费节点把 key 放在 URL 路径或 query 里。见 `sanitizeRpcUrl`。
   */
  rpcFingerprint: string;
  /**
   * Moss Capability 的语义元数据（来自 registry.load）。
   * Intent（意图）是签前证据的核心——它解释这笔交易"想干什么"，
   * 用户签名前必须看到，E3 也应归档。
   */
  intent: {
    intent: string;
    verb: string;
    category: string;
    risk: string[];
    tags: string[];
  };
}

export interface MossBridgeOptions {
  rpcUrl?: string;
}

// ────────────────────────────────────────────────────────────
// Implementation
// ────────────────────────────────────────────────────────────

/**
 * 把 RPC URL 变成可安全归档的指纹。
 *
 * 很多节点服务把密钥放在 URL 里：
 *
 * ```
 * https://user:pass@rpc.example.com/v1/KEY?apikey=SECRET
 *   → https://rpc.example.com/v1/***
 * ```
 *
 * 规则：丢掉 userinfo、丢掉整个 query、路径里长度 ≥ 16 的段替换成 `***`
 * （那种长度基本只可能是密钥）。保留 host 和路径结构，
 * 因为"用的是哪个服务商"本身是有验证价值的信息。
 */
export function sanitizeRpcUrl(rpcUrl: string): string {
  let u: URL;
  try {
    u = new URL(rpcUrl);
  } catch {
    return "(invalid-rpc-url)";
  }
  const path = u.pathname
    .split("/")
    .map((seg) => (seg.length >= 16 ? "***" : seg))
    .join("/");
  return `${u.protocol}//${u.host}${path === "/" ? "" : path}`;
}

const DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";

/** 实际用于创建 Runtime 的 RPC —— 与 E3 里归档的指纹同源 */
let _rpcUrl: string | null = null;
let _runtime: MossRuntime | null = null;
let _registry: Registry | null = null;

async function getRuntime(opts: MossBridgeOptions = {}): Promise<MossRuntime> {
  if (!_runtime) {
    _rpcUrl = opts.rpcUrl ?? DEFAULT_RPC_URL;
    _runtime = await monadTestnetRuntime({ rpcUrl: _rpcUrl });
  } else if (opts.rpcUrl && opts.rpcUrl !== _rpcUrl) {
    // Runtime 是全局缓存的，后来的 rpcUrl 不会生效。静默忽略会让
    // E3 归档的端点与实际使用的不一致，所以直接报错。
    throw new Error(
      `MossBridge Runtime 已用 ${sanitizeRpcUrl(_rpcUrl ?? "")} 初始化，` +
        `不能改用 ${sanitizeRpcUrl(opts.rpcUrl)}。请调用 resetMossBridge() 后重建。`,
    );
  }
  return _runtime;
}

function getRegistry(runtime: MossRuntime): Registry {
  if (!_registry) {
    _registry = new Registry(runtime).use(siliconArbitration);
  }
  return _registry;
}

/**
 * Prepare a createTask transaction for wallet signing.
 *
 * @param account The client's wallet address.
 * @param amountMon Human-readable MON amount to escrow (e.g. "0.2").
 * @param requirementsHash 规范化条款的 keccak-256 哈希，**十六进制 `0x…` 形式**
 *   （即 `computeRequirementsHash()` 的输出，也是合约 bytes32 的形式）。
 *
 *   ⚠️ Moss 的参数校验要的是**十进制非负整数字符串**，传十六进制会报
 *   `Expected a non-negative integer string`。转换在本函数内部完成——
 *   全项目只用一种表示（十六进制），到 Moss 边界才转，调用方不可能传错。
 * @param deadline Unix timestamp after which the task can be refunded.
 */
export async function prepareCreateTask(
  account: Address,
  amountMon: string,
  requirementsHash: string,
  deadline: string,
  opts: MossBridgeOptions = {},
): Promise<PreparedTask> {
  const runtime = await getRuntime(opts);
  const registry = getRegistry(runtime);

  // 十六进制 → 十进制，只在这一处发生
  if (!/^0x[0-9a-fA-F]+$/.test(requirementsHash)) {
    throw new Error(
      `requirementsHash 必须是十六进制 0x… 形式，收到 ${requirementsHash}。` +
        `请传 computeRequirementsHash() 的输出。`,
    );
  }
  const requirementsHashInt = BigInt(requirementsHash).toString();

  // 这一份就是发给 Moss 的原样参数，后面 buildE3 直接归档它
  const capabilityParams = {
    protocol: "silicon-arbitration",
    method: "createTask",
    account,
    amount: amountMon,
    requirementsHash: requirementsHashInt,
    deadline,
  } as const;

  const capability = await registry.action(
    "silicon-arbitration",
    "createTask",
    account,
    { amount: amountMon, requirementsHash: requirementsHashInt, deadline },
  );

  if (capability.kind !== "capability") {
    throw new Error(`MossBridge: unexpected action result ${capability.kind}`);
  }

  // 取 Capability 语义元数据（intent/verb/risk/tags），签名前必须展示给用户
  const [loaded] = registry.load([{ protocol: capability.protocol, method: capability.method }]);
  if (!loaded) {
    throw new Error(`MossBridge: registry.load returned nothing for ${capability.protocol}.${capability.method}`);
  }
  const intent = {
    intent: loaded.intent,
    verb: loaded.verb ?? "unknown",
    category: loaded.category,
    risk: loaded.risk,
    tags: loaded.tags,
  };

  const simulator = createTraceSimulator(runtime, {
    receipt: (_, changes) => registry.parseReceipt(capability, changes),
  });

  const outcome = await simulator.simulate(capability);
  const sim = outcome.results[0];
  if (!sim) {
    throw new Error("MossBridge: simulation produced no results");
  }

  const warnings = sim.warnings.map((w) => `[${w.code}] ${w.message}`);

  return {
    unsignedTransaction: {
      to: sim.transaction.to,
      data: sim.transaction.data,
      value: sim.transaction.value,
      from: sim.transaction.from,
    },
    estimatedGas: sim.gas ?? "0",
    simulationFailed: sim.reverted || sim.warnings.length > 0,
    warnings,
    evidenceHash: null,
    receipt: sim.receipt ?? null,
    capabilityParams,
    rpcFingerprint: sanitizeRpcUrl(_rpcUrl ?? DEFAULT_RPC_URL),
    intent,
  };
}

// ────────────────────────────────────────────────────────────
// Wallet consistency gate
// ────────────────────────────────────────────────────────────

/**
 * Compute a deterministic fingerprint of the unsigned transaction.
 * The wallet UI should show this before the user signs, and the same
 * hash must be recomputed from the broadcast transaction for comparison.
 */
export function computeTransactionFingerprint(
  unsignedTx: PreparedTask["unsignedTransaction"],
): string {
  // Concatenation of the four fields that must not change.
  // A full keccak-256 would require an extra dependency; this
  // djb2-style hash is deterministic and sufficient for a
  // pre-sign visual fingerprint comparison.
  const raw = `${unsignedTx.to}:${unsignedTx.data}:${unsignedTx.value}:${unsignedTx.from}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `0x${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Result of comparing a wallet-signed transaction against Moss's unsigned
 * transaction.
 */
export interface WalletConsistencyResult {
  consistent: boolean;
  mismatches: string[];
}

/**
 * Verify that the wallet-signed transaction matches the Moss unsigned
 * transaction field-by-field.
 *
 * AGENTS.md P1-3: "签名前计算 fingerprint，广播后与链上交易回读结果比对"
 *
 * @param unsignedTx The Moss unsigned transaction from prepareCreateTask.
 * @param signedTx The transaction the wallet actually signed (to, data, value, from, chainId).
 */
/**
 * 把 moss-bridge 内部的比对结果转成 domain 存档用的形状。
 *
 * 两边字段名不同不是笔误：内部关心"是否一致/差在哪些字段"，
 * 存档关心"是否匹配/不匹配字段列表"。转换收在这一处，别处不许再手转。
 */
export function toArchivedWalletConsistency(
  r: WalletConsistencyResult,
): NonNullable<MossPreSignEvidence["walletConsistency"]> {
  return r.consistent
    ? { matched: true }
    : { matched: false, mismatchFields: r.mismatches };
}

export function verifyWalletConsistency(
  unsignedTx: PreparedTask["unsignedTransaction"],
  signedTx: {
    to: string;
    data: string;
    value: string;
    from: string;
    chainId: number;
  },
): WalletConsistencyResult {
  const mismatches: string[] = [];

  if (signedTx.to.toLowerCase() !== unsignedTx.to.toLowerCase()) {
    mismatches.push(
      `to mismatch: signed ${signedTx.to}, unsigned ${unsignedTx.to}`,
    );
  }
  if (signedTx.data.toLowerCase() !== unsignedTx.data.toLowerCase()) {
    mismatches.push("data mismatch");
  }
  if (signedTx.value.toLowerCase() !== unsignedTx.value.toLowerCase()) {
    mismatches.push(
      `value mismatch: signed ${signedTx.value}, unsigned ${unsignedTx.value}`,
    );
  }
  if (signedTx.from.toLowerCase() !== unsignedTx.from.toLowerCase()) {
    mismatches.push(
      `from mismatch: signed ${signedTx.from}, unsigned ${unsignedTx.from}`,
    );
  }
  if (signedTx.chainId !== 10143) {
    mismatches.push(
      `chainId mismatch: signed ${signedTx.chainId}, expected 10143`,
    );
  }

  return { consistent: mismatches.length === 0, mismatches };
}

// ────────────────────────────────────────────────────────────
// Canonical E3 evidence
// ────────────────────────────────────────────────────────────

/**
 * E3 证据的类型**直接复用 domain 的 `MossPreSignEvidence`**。
 *
 * ⚠️ 这里原本有一份手写的 `E3Evidence`，注释写着 "Mirrors domain"，
 * 实际上早已漂移：缺 `rpcFingerprint`、`semantics` 少一层 `mossCoordinate`、
 * `walletConsistency` 字段名也不同（`consistent/mismatches`
 * vs `matched/mismatchFields`）。
 *
 * 后果是 `buildE3()` 的返回值**塞不进 `Case`**，而编译器不会提醒——
 * 两个各自手写的类型之间没有任何编译期关联。
 *
 * 现在只留一个来源：domain 定义存档形状，moss-bridge 直接产出那个形状，
 * 哈希也对那个形状计算。**存进案件的和算过哈希的，保证是同一个东西。**
 */
export type E3Evidence = MossPreSignEvidence;

export interface E3Provenance {
  /** 实际使用的 Moss commit。**从 moss.lock.json 读，不要抄。** */
  mossCommit: string;
  /** 实际使用的协议包版本。**从 package.json 读，不要抄。** */
  protocolVersion: string;
}

export function getE3Provenance(): E3Provenance {
  // serverless（Vercel）运行时没有仓库文件：构建期由 next.config 注入 env。
  // 本地 dev / 直接 node 调用回退到下面从 cwd 上溯读仓库根文件，两条路径同源同序。
  const envCommit = process.env.SLA_MOSS_LOCK_COMMIT;
  const envProtocolVersion = process.env.SLA_MOSS_PROTOCOL_VERSION;
  if (envCommit && envProtocolVersion) {
    return {
      mossCommit: envCommit,
      protocolVersion: `silicon-arbitration@${envProtocolVersion}`,
    };
  }
  // 仓库根：从 cwd 上溯找 moss.lock.json（Next.js 编译后 import.meta.dirname 不可靠）
  let dir = process.cwd();
  let lockPath: string | null = null;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, "moss.lock.json");
    try {
      readFileSync(candidate, "utf-8");
      lockPath = candidate;
      break;
    } catch {
      dir = resolve(dir, "..");
    }
  }
  if (!lockPath) throw new Error("找不到 moss.lock.json（从 cwd 上溯 6 级内）");
  const lock = JSON.parse(readFileSync(lockPath, "utf-8")) as { commit?: string };
  // 协议包版本：从仓库根 vendor/moss 读（workspace 源码，与 import 的包同源）
  const protocolPkg = JSON.parse(
    readFileSync(resolve(dirname(lockPath), "vendor", "moss", "packages", "protocols", "silicon-arbitration", "package.json"), "utf-8"),
  ) as { version?: string };
  if (!lock.commit) throw new Error("moss.lock.json 缺 commit 字段");
  if (!protocolPkg.version) throw new Error("protocol-silicon-arbitration 缺 version");
  return {
    mossCommit: lock.commit,
    protocolVersion: `silicon-arbitration@${protocolPkg.version}`,
  };
}

/**
 * 由一次已完成的模拟，构造出**可直接存进 `Case` 的 E3 证据**。
 *
 * ## 两条不可违背的约束
 *
 * **1. provenance 必须由调用方从真实来源读取，不再有默认值。**
 *
 * 这里原先把 mossCommit 写死成 `5d70524e…`、protocolVersion 写死成 `0.1.0`，
 * 而实际用的是 `b00ed2db…` 和 `0.0.1`——证据声称的版本不是真正用的那个。
 * 一份声称可供第三方复算的证据，如果溯源字段是抄进来的，它就只是好看。
 *
 * **2. 产出的就是最终存档形状，哈希也对这个形状计算。**
 *
 * 原先本文件另有一份手写的 `E3Evidence`，与 domain 的 `MossPreSignEvidence`
 * 已经漂移（缺 `rpcFingerprint`、`semantics` 少一层 `mossCoordinate`、
 * `walletConsistency` 字段名不同）。于是返回值塞不进 `Case`，
 * 而哈希盖的是那个中间形状——**第三方拿到案件档案复算不出同一个值**。
 *
 * 现在只有一个形状：domain 定义它，这里产出它，哈希盖它，案件存它。
 */
export async function buildE3(
  task: PreparedTask,
  explanation: string,
  provenance: E3Provenance,
  walletConsistency?: WalletConsistencyResult,
): Promise<E3Evidence> {
  const e3: Omit<E3Evidence, "canonicalPayloadHash"> = {
    explanation,
    chainId: MONAD_TESTNET_CHAIN_ID,
    // ⚠️ 下面两项都来自 task 而非 provenance：它们必须是**实际发生的**，
    // 不能由调用方另行提供。见 PreparedTask 上的说明。
    rpcFingerprint: task.rpcFingerprint,
    mossCommit: provenance.mossCommit,
    protocolVersion: provenance.protocolVersion,
    contractAddress: task.unsignedTransaction.to,
    abiHash:
      "0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5",
    capabilityParams: task.capabilityParams,
    // Intents：Moss Capability 的语义元数据，签名前展示且随 E3 归档
    intent: task.intent,
    // domain 的 UnsignedTx 带 chainId，PreparedTask 的不带——在这里补齐，
    // 而不是让每个调用方各自拼一遍
    unsignedTx: {
      from: task.unsignedTransaction.from,
      to: task.unsignedTransaction.to,
      data: task.unsignedTransaction.data,
      value: task.unsignedTransaction.value,
      chainId: MONAD_TESTNET_CHAIN_ID,
    },
    simulation: {
      receipt: task.receipt,
      warnings: task.warnings,
    },
    semantics: {
      domainAction: "commission",
      mossCoordinate: { protocol: "silicon-arbitration", method: "createTask" },
      mossVerb: "transfer",
      semanticMappingVersion: "create-task-v1",
      semanticFidelity: "coarse-verb",
      tags: ["task-creation", "escrow", "agent-work", "arbitration"],
    },
    // ⚠️ 未做钱包一致性校验时**整个键省略**，而不是留 undefined。
    //
    // `{ walletConsistency }` 简写在参数省略时会造出一个值为 undefined 的
    // 自有属性。旧的 JSON.stringify 会静默丢掉它，canonicalJson 则会抛错——
    // 于是 `buildE3(task, explanation)` 两参数调用直接失败。
    //
    // 省略而非填 null，是因为"没做校验"和"做了但结果为空"对证据的含义
    // 完全不同，不该被压成同一个值。
    ...(walletConsistency ? { walletConsistency: toArchivedWalletConsistency(walletConsistency) } : {}),
  };

  // 哈希覆盖的就是上面这个最终形状（`computeE3PayloadHash` 会剔除
  // `canonicalPayloadHash` 自身）。第三方拿到案件里的 E3，
  // 跑一次 `verifyE3PayloadHash` 就能验真。
  return { ...e3, canonicalPayloadHash: computeE3PayloadHash(e3) };
}

/**
 * Warm up the MossBridge by pre-initializing the runtime and registry.
 * Call this once at server startup to avoid cold-start latency on the first
 * real request.
 */
export async function warmup(opts: MossBridgeOptions = {}): Promise<void> {
  await getRuntime(opts);
  getRegistry(await getRuntime(opts));
}
