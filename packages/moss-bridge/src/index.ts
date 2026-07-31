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

/**
 * Warm up the MossBridge by pre-initializing the runtime and registry.
 * Call this once at server startup to avoid cold-start latency on the first
 * real request.
 */
export async function warmup(opts: MossBridgeOptions = {}): Promise<void> {
  await getRuntime(opts);
  getRegistry(await getRuntime(opts));
}
