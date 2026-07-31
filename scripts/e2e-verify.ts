#!/usr/bin/env tsx
/**
 * Silicon Labor Arbitration — End-to-End Verification
 *
 * Full lifecycle: createTask → verify TaskCreated → assignAgent →
 * submitDelivery → acceptDelivery → verify payment.
 *
 * Usage:
 *   npx tsx scripts/e2e-verify.ts
 *
 * Requirements:
 *   - contracts/.env with DEPLOYER_PRIVATE_KEY and MONAD_TESTNET_RPC_URL
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseAbi,
  decodeEventLog,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Config ──────────────────────────────────────────────────

const TASK_ESCROW_ADDRESS = "0x67040374b8A9756586De0885f01d1291cE8FFCcF";

const TaskEscrowAbi = parseAbi([
  "function createTask(bytes32 requirementsHash, uint256 deadline) payable returns (bytes32 taskId)",
  "function assignAgent(bytes32 taskId, address agent)",
  "function submitDelivery(bytes32 taskId, bytes32 deliveryHash)",
  "function acceptDelivery(bytes32 taskId)",
  "function getTaskStatus(bytes32 taskId) view returns (uint8)",
  "event TaskCreated(bytes32 indexed taskId, address indexed client, uint256 amount, bytes32 reqHash, uint256 deadline)",
  "event AgentAssigned(bytes32 indexed taskId, address indexed agent)",
  "event DeliverySubmitted(bytes32 indexed taskId, address indexed agent, bytes32 deliveryHash)",
  "event TaskAccepted(bytes32 indexed taskId, address indexed agent, uint256 amount)",
]);

const TASK_STATUS_LABELS: Record<number, string> = {
  0: "None",
  1: "Created",
  2: "Delivered",
  3: "Disputed",
  4: "ManualReview",
  5: "Accepted",
  6: "Settled",
  7: "Refunded",
};

// ── Helpers ─────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), "..", "contracts/.env");
  const content = readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const env = loadEnv();
  const rpcUrl = env.MONAD_TESTNET_RPC_URL;
  const deployerKey = env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(rpcUrl),
  });

  const client = privateKeyToAccount(deployerKey);
  const wallet = createWalletClient({
    chain: monadTestnet,
    transport: http(rpcUrl),
    account: client,
  });

  // Use a separate account as the Agent
  const agentKey = `0x${(BigInt(deployerKey) + 999n).toString(16).padStart(64, "0")}` as `0x${string}`;
  const agent = privateKeyToAccount(agentKey);
  const agentWallet = createWalletClient({
    chain: monadTestnet,
    transport: http(rpcUrl),
    account: agent,
  });

  console.log("=== Silicon Labor Arbitration — E2E Verification ===\n");
  console.log(`RPC:     ${rpcUrl}`);
  console.log(`Contract: ${TASK_ESCROW_ADDRESS}`);
  console.log(`Client:  ${client.address}`);
  console.log(`Agent:   ${agent.address}\n`);

  // Fund agent for gas
  console.log("0. Funding agent with 0.01 MON for gas...");
  const fundHash = await wallet.sendTransaction({
    to: agent.address,
    value: parseEther("0.01"),
  });
  await publicClient.waitForTransactionReceipt({ hash: fundHash });
  console.log(`   funded: ${fundHash}\n`);

  // Step 1: createTask
  console.log("1. createTask — locking 0.1 MON...");
  const requirementsHash =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const createHash = await wallet.sendTransaction({
    to: TASK_ESCROW_ADDRESS,
    data: `0x6fbb5f62${requirementsHash.slice(2)}${deadline.toString(16).padStart(64, "0")}`,
    value: parseEther("0.1"),
  });
  const createReceipt = await publicClient.waitForTransactionReceipt({
    hash: createHash,
  });
  console.log(`   tx: ${createHash}`);
  console.log(`   block: ${createReceipt.blockNumber}`);
  console.log(`   gas: ${createReceipt.gasUsed}`);
  console.log(`   status: ${createReceipt.status}`);

  // Decode TaskCreated
  let taskId = "";
  for (const log of createReceipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: TaskEscrowAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "TaskCreated") {
        taskId = decoded.args.taskId;
        console.log(`   taskId: ${taskId}`);
        console.log(`   amount: ${decoded.args.amount}`);
        console.log(`   reqHash: ${decoded.args.reqHash}`);
        console.log(`   deadline: ${decoded.args.deadline}`);
      }
    } catch {
      // Not our event
    }
  }
  if (!taskId) throw new Error("TaskCreated event not found");

  // Step 2: assignAgent
  console.log("\n2. assignAgent...");
  const assignHash = await wallet.sendTransaction({
    to: TASK_ESCROW_ADDRESS,
    data: `0xbe2e0cee${taskId.slice(2)}${agent.address.slice(2).padStart(64, "0")}`,
  });
  const assignReceipt = await publicClient.waitForTransactionReceipt({
    hash: assignHash,
  });
  console.log(`   tx: ${assignHash}`);
  console.log(`   block: ${assignReceipt.blockNumber}`);
  console.log(`   status: ${assignReceipt.status}`);

  // Step 3: submitDelivery
  console.log("\n3. submitDelivery...");
  const deliveryHash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const submitHash = await agentWallet.sendTransaction({
    to: TASK_ESCROW_ADDRESS,
    data: `0x94e8b028${taskId.slice(2)}${deliveryHash.slice(2)}`,
  });
  const submitReceipt = await publicClient.waitForTransactionReceipt({
    hash: submitHash,
  });
  console.log(`   tx: ${submitHash}`);
  console.log(`   block: ${submitReceipt.blockNumber}`);
  console.log(`   status: ${submitReceipt.status}`);

  // Step 4: acceptDelivery
  console.log("\n4. acceptDelivery — paying Agent 0.1 MON...");
  const agentBefore = await publicClient.getBalance({ address: agent.address });
  const acceptHash = await wallet.sendTransaction({
    to: TASK_ESCROW_ADDRESS,
    data: `0x0bd58917${taskId.slice(2)}`,
  });
  const acceptReceipt = await publicClient.waitForTransactionReceipt({
    hash: acceptHash,
  });
  const agentAfter = await publicClient.getBalance({ address: agent.address });
  console.log(`   tx: ${acceptHash}`);
  console.log(`   block: ${acceptReceipt.blockNumber}`);
  console.log(`   status: ${acceptReceipt.status}`);
  console.log(`   Agent balance before: ${agentBefore}`);
  console.log(`   Agent balance after:  ${agentAfter}`);

  // Verify status
  const statusRaw = (await publicClient.readContract({
    address: TASK_ESCROW_ADDRESS,
    abi: TaskEscrowAbi,
    functionName: "getTaskStatus",
    args: [taskId],
  })) as number;
  console.log(`   Task status: ${TASK_STATUS_LABELS[statusRaw] ?? statusRaw} (${statusRaw})`);

  // Summary
  console.log("\n=== E2E Summary ===");
  console.log(`createTask:       ${createHash}`);
  console.log(`assignAgent:      ${assignHash}`);
  console.log(`submitDelivery:   ${submitHash}`);
  console.log(`acceptDelivery:   ${acceptHash}`);
  console.log(`Task ID:          ${taskId}`);
  console.log(`Task status:      ${TASK_STATUS_LABELS[statusRaw] ?? statusRaw}`);

  if (statusRaw !== 5) {
    // 5 = Accepted
    console.error(`\n❌ Expected status Accepted(5), got ${statusRaw}`);
    process.exit(1);
  }

  console.log("\n✅ E2E verification passed");
}

main().catch((err) => {
  console.error(`\nFATAL: ${err}`);
  process.exit(1);
});
