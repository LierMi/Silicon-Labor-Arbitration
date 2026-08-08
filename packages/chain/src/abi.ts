/**
 * TaskEscrow ABI（Gate 4 完整生命周期）
 *
 * ⚠️ 与 `contracts/src/TaskEscrow.sol` 保持一致。合约改了这里也要改。
 * Moss-facing 的 `createTask` ABI hash 已冻结：
 * 0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5
 */

export const taskEscrowAbi = [
  // ── 写入 ────────────────────────────────────────────
  {
    type: "function",
    name: "createTask",
    stateMutability: "payable",
    inputs: [
      { name: "requirementsHash", type: "bytes32" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "taskId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "assignAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "taskId", type: "bytes32" },
      { name: "agent", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submitDelivery",
    stateMutability: "nonpayable",
    inputs: [
      { name: "taskId", type: "bytes32" },
      { name: "deliveryHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "acceptDelivery",
    stateMutability: "nonpayable",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "refundExpiredTask",
    stateMutability: "nonpayable",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "openDispute",
    stateMutability: "nonpayable",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [{ name: "caseId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "caseId", type: "bytes32" },
      { name: "toAgent", type: "uint256" },
      { name: "toClient", type: "uint256" },
      { name: "frozen", type: "uint256" },
      { name: "settlementProposalHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "releaseFrozen",
    stateMutability: "nonpayable",
    inputs: [
      { name: "caseId", type: "bytes32" },
      { name: "toAgent", type: "uint256" },
      { name: "toClient", type: "uint256" },
      { name: "reviewDecisionHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawPayment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "taskId", type: "bytes32" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
  },
  // ── 只读 ────────────────────────────────────────────
  {
    type: "function",
    name: "tasks",
    stateMutability: "view",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [
      { name: "client", type: "address" },
      { name: "agent", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "requirementsHash", type: "bytes32" },
      { name: "deliveryHash", type: "bytes32" },
      { name: "caseId", type: "bytes32" },
      { name: "deadline", type: "uint256" },
      { name: "frozenAmount", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "settlementProposalHash", type: "bytes32" },
      { name: "reviewDecisionHash", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "getTaskStatus",
    stateMutability: "view",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "settlementAuthority",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "authorityAdmin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  // ── 事件 ────────────────────────────────────────────
  {
    type: "event",
    name: "TaskCreated",
    inputs: [
      { name: "taskId", type: "bytes32", indexed: true },
      { name: "client", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "reqHash", type: "bytes32", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentAssigned",
    inputs: [
      { name: "taskId", type: "bytes32", indexed: true },
      { name: "agent", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "DeliverySubmitted",
    inputs: [
      { name: "taskId", type: "bytes32", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "deliveryHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TaskAccepted",
    inputs: [
      { name: "taskId", type: "bytes32", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DisputeOpened",
    inputs: [
      { name: "taskId", type: "bytes32", indexed: true },
      { name: "caseId", type: "bytes32", indexed: true },
    ],
  },
  {
    type: "event",
    name: "PaymentDeferred",
    inputs: [
      { name: "taskId", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  // ── 错误（用于解码 revert，让前端显示可读错误而非乱码）─────────
  { type: "error", name: "Unauthorized", inputs: [{ name: "caller", type: "address" }] },
  { type: "error", name: "InvalidStatus", inputs: [{ name: "taskId", type: "bytes32" }, { name: "expected", type: "uint8" }, { name: "actual", type: "uint8" }] },
  { type: "error", name: "EmptyDeliveryHash", inputs: [] },
  { type: "error", name: "DeliveryWindowClosed", inputs: [{ name: "deadline", type: "uint256" }, { name: "currentTimestamp", type: "uint256" }] },
] as const;

/** 合约 TaskStatus 枚举 → 我们 domain 的 CaseStatus 用的是不同集合，见 status.ts 的映射 */
export const CONTRACT_TASK_STATUS = [
  "None",
  "Created",
  "Delivered",
  "Disputed",
  "ManualReview",
  "Accepted",
  "Settled",
  "Refunded",
] as const;

export type ContractTaskStatus = (typeof CONTRACT_TASK_STATUS)[number];
