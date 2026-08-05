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
import { createTraceSimulator } from "@themoss/simulator";
import { monadTestnetRuntime } from "@themoss/system";
import * as siliconArbitration from "@themoss/protocol-silicon-arbitration";
import type { MossRuntime } from "@themoss/core";
import { canonicalJson } from "@sla/domain";

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
}

export interface MossBridgeOptions {
  rpcUrl?: string;
}

// ────────────────────────────────────────────────────────────
// Implementation
// ────────────────────────────────────────────────────────────

let _runtime: MossRuntime | null = null;
let _registry: Registry | null = null;

async function getRuntime(opts: MossBridgeOptions = {}): Promise<MossRuntime> {
  if (!_runtime) {
    _runtime = await monadTestnetRuntime({
      rpcUrl: opts.rpcUrl ?? "https://testnet-rpc.monad.xyz",
    });
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
 * @param requirementsHash Integer string representation of the canonical
 *   requirements keccak-256 hash (semanticFidelity=coarse-verb).
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

  const capability = await registry.action(
    "silicon-arbitration",
    "createTask",
    account,
    { amount: amountMon, requirementsHash, deadline },
  );

  if (capability.kind !== "capability") {
    throw new Error(`MossBridge: unexpected action result ${capability.kind}`);
  }

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
 * Stable product type for the E3 pre-sign evidence.
 * Mirrors packages/domain/src/case.ts MossPreSignEvidence.
 */
export interface E3Evidence {
  explanation: string;
  chainId: number;
  mossCommit: string;
  protocolVersion: string;
  contractAddress: string;
  abiHash: string;
  capabilityParams: Record<string, unknown>;
  unsignedTx: PreparedTask["unsignedTransaction"];
  simulation: {
    receipt: unknown;
    warnings: string[];
  };
  semantics: {
    domainAction: "commission";
    mossVerb: "transfer";
    protocol: "silicon-arbitration";
    method: "createTask";
    semanticMappingVersion: "create-task-v1";
    semanticFidelity: "coarse-verb";
    tags: string[];
  };
  canonicalPayloadHash: string;
  walletConsistency?: WalletConsistencyResult;
}

/**
 * Build the canonical E3 pre-sign evidence from a prepared task.
 *
 * This is the evidence that proves the user was shown exactly what Moss
 * simulated before signing. The canonicalPayloadHash allows third parties
 * to verify that the explanation has not been edited after the fact.
 */
export async function buildE3(
  task: PreparedTask,
  explanation: string,
  walletConsistency?: WalletConsistencyResult,
): Promise<E3Evidence> {
  const { keccak256, toHex } = await import("viem");

  const e3: Omit<E3Evidence, "canonicalPayloadHash"> = {
    explanation,
    chainId: 10143,
    mossCommit: "5d70524e83a6c5338a8db3b933e9726396365786",
    protocolVersion: "0.1.0",
    contractAddress: "0x67040374b8A9756586De0885f01d1291cE8FFCcF",
    abiHash:
      "0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5",
    capabilityParams: {
      protocol: "silicon-arbitration",
      method: "createTask",
    },
    unsignedTx: task.unsignedTransaction,
    simulation: {
      receipt: task.receipt,
      warnings: task.warnings,
    },
    semantics: {
      domainAction: "commission",
      mossVerb: "transfer",
      protocol: "silicon-arbitration",
      method: "createTask",
      semanticMappingVersion: "create-task-v1",
      semanticFidelity: "coarse-verb",
      tags: [
        "task-creation",
        "escrow",
        "agent-work",
        "arbitration",
      ],
    },
    walletConsistency,
  };

  // Deterministic canonical hash.
  //
  // ⚠️ 原先这里是 `JSON.stringify(e3, Object.keys(e3).sort())`。那不是排序器——
  // 第二个参数传数组时，它是**作用于所有层级的字段白名单**，于是
  // unsignedTx / simulation / semantics 这些嵌套对象全被清成 `{}`：
  //
  //   { b: 1, a: { nested: 2 } }  →  {"a":{},"b":1}
  //
  // 后果是两份完全不同的 E3 只要顶层基本字段一致就算出同一个哈希，
  // "第三方可复算验证"这个作用直接失效。改用 @sla/domain 的递归规范化。
  const hash = keccak256(toHex(canonicalJson(e3)));

  return { ...e3, canonicalPayloadHash: hash };
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
