#!/usr/bin/env tsx
/**
 * Silicon Labor Arbitration — Concurrency Demo
 *
 * Creates N independent tasks in parallel from a single funded wallet.
 * Each createTask call is an independent contract interaction with no
 * shared storage slots, so they can be submitted concurrently on Monad.
 *
 * Usage: npx tsx scripts/concurrency-demo.ts [N]
 */
import {
  createPublicClient,
  http,
  parseEther,
  parseAbi,
  encodeFunctionData,
  type WalletClient,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONTRACT = "0x67040374b8A9756586De0885f01d1291cE8FFCcF";
const ABI = parseAbi([
  "function createTask(bytes32 requirementsHash, uint256 deadline) payable returns (bytes32 taskId)",
  "event TaskCreated(bytes32 indexed taskId, address indexed client, uint256 amount, bytes32 reqHash, uint256 deadline)",
]);

function loadEnv(): Record<string, string> {
  const p = resolve(process.cwd(), "..", "contracts/.env");
  const env: Record<string, string> = {};
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    env[t.slice(0, eq)] = t.slice(eq + 1);
  }
  return env;
}

interface TaskResult {
  nonce: number;
  taskId: string;
  txHash: string;
  block: bigint;
  gas: bigint;
  ms: number;
}

async function main() {
  const count = Math.min(50, Math.max(1, Number(process.argv[2]) || 30));
  const env = loadEnv();
  const rpc = env.MONAD_TESTNET_RPC_URL;
  const key = env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

  const account = privateKeyToAccount(key);
  const publicClient: PublicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(rpc, { timeout: 120_000 }),
  });

  console.log(`=== Concurrency Demo ===`);
  console.log(`Wallet:   ${account.address}`);
  console.log(`Tasks:    ${count}`);
  console.log(`RPC:      ${rpc}\n`);

  // Get current nonce
  const baseNonce = await publicClient.getTransactionCount({
    address: account.address,
  });

  // Phase 1: Submit all transactions
  console.log(`Submitting ${count} createTask calls from nonce ${baseNonce}...`);
  const startTime = Date.now();

  const pending: { nonce: number; hash: string }[] = [];
  for (let i = 0; i < count; i++) {
    const requirementsHash = `0x${(i + 1).toString(16).padStart(64, "0")}` as `0x${string}`;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 7200);
    const nonce = baseNonce + i;

    // Serialize signing (viem's walletClient serializes nonce internally)
    // We sign and get the raw tx, then broadcast all in parallel
    const raw = await account.signTransaction({
      chainId: 10143,
      to: CONTRACT,
      data: encodeFunctionData({
        abi: ABI,
        functionName: "createTask",
        args: [requirementsHash, deadline],
      }),
      value: parseEther("0.1"),
      gas: 300000n,
      gasPrice: 102000000000n,
      type: "legacy" as const,
      nonce,
    });

    // Broadcast (don't await — fire and collect hashes)
    const hash = await publicClient.sendRawTransaction({
      serializedTransaction: raw,
    });
    pending.push({ nonce, hash });

    if ((i + 1) % 10 === 0 || i === count - 1) {
      console.log(`  Submitted ${i + 1}/${count} (latest hash: ${hash.slice(0, 12)}...)`);
    }
  }

  const submitMs = Date.now() - startTime;
  console.log(`All ${count} transactions submitted in ${submitMs}ms\n`);

  // Phase 2: Wait for confirmations
  console.log("Waiting for confirmations...");
  const results: TaskResult[] = [];
  const entryMs = Date.now();

  for (const { nonce, hash } of pending) {
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
      });
      let taskId = "unknown";
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === CONTRACT.toLowerCase()) {
          taskId = log.topics[1] ?? "unknown";
        }
      }
      results.push({
        nonce,
        taskId,
        txHash: hash,
        block: receipt.blockNumber,
        gas: receipt.gasUsed,
        ms: Date.now() - entryMs,
      });
    } catch (err) {
      console.log(`  nonce ${nonce} failed: ${String(err).slice(0, 60)}`);
    }
  }

  const totalMs = Date.now() - startTime;

  console.log(`\n=== Results ===`);
  console.log(`Total:    ${totalMs}ms`);
  console.log(`Confirmed: ${results.length}/${count}`);
  console.log(`Failed:   ${count - results.length}`);

  if (results.length > 0) {
    const blocks = results.map((r) => Number(r.block));
    console.log(`Blocks:   ${Math.min(...blocks)} – ${Math.max(...blocks)} (span: ${Math.max(...blocks) - Math.min(...blocks)})`);
    const gasVals = results.map((r) => Number(r.gas));
    console.log(`Gas:      ${Math.round(gasVals.reduce((a, b) => a + b, 0) / gasVals.length)} avg`);
    const times = results.map((r) => r.ms);
    console.log(`Confirm:  ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}ms avg`);
  }

  // Print tx list
  console.log(`\nTransactions:`);
  for (const r of results) {
    console.log(
      `  nonce ${r.nonce} | ${r.txHash.slice(0, 12)}... | block ${r.block} | gas ${r.gas} | ${r.ms}ms`
    );
  }
}

main().catch((err) => {
  console.error(`FATAL: ${err}`);
  process.exit(1);
});
