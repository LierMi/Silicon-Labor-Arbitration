# Contracts

Foundry project for Silicon Labor Arbitration on Monad Testnet (`chainId = 10143`).

## Frozen Moss scope

The first frozen Moss-facing interface is deliberately narrow:

```solidity
createTask(bytes32 requirementsHash, uint256 deadline)
    payable
    returns (bytes32 taskId)

TaskCreated(
    bytes32 indexed taskId,
    address indexed client,
    uint256 amount,
    bytes32 reqHash,
    uint256 deadline
)
```

`requirementsHash` commits the canonical offchain requirements payload. The contract does not interpret subjective requirements and does not issue judgments.

## Direct-path lifecycle

Gate 4 adds the wallet-driven lifecycle without expanding the Moss Protocol surface:

```text
createTask → assignAgent → submitDelivery
  ├─ acceptDelivery → full Agent payment
  ├─ openDispute → settle → [optional frozen amount] → releaseFrozen
  └─ refundExpiredTask (undelivered and after deadline)

failed direct payment → per-task claimable credit → withdrawPayment
```

- only the client assigns the Agent and accepts or refunds the task;
- only the assigned Agent can submit delivery;
- delivery closes after the deadline, so a late Agent transaction cannot preempt the client's refund path;
- either participant can open a dispute;
- the current `settlementAuthority` witnesses deterministic allocations and releases human-reviewed frozen funds;
- `settle` records a non-zero `settlementProposalHash`, and `releaseFrozen` records a non-zero `reviewDecisionHash`, linking the on-chain amounts to the exact off-chain rule/review evidence;
- a distinct immutable `authorityAdmin` may nominate a replacement authority, which must explicitly accept before gaining settlement power;
- every settlement allocation must conserve the exact escrowed amount;
- terminal states prevent duplicate acceptance, settlement, refund, or frozen release;
- external-value paths use checks-effects-interactions plus a per-task reentrancy lock, avoiding a global lock shared by independent Monad tasks; this reduces business-storage conflicts but is not a claim of zero contention because contract balance and account state remain shared;
- a failed bounded-gas direct payment becomes a `taskId + recipient` claimable credit instead of reverting the terminal state or blocking another recipient.

`settlementAuthority` is a trusted witness at this stage. The contract verifies authorization, task/case binding, non-zero evidence hashes, lifecycle state, and amount conservation; it does not recompute the TypeScript rule engine on-chain or prove that a supplied hash is the canonical rule output. The bridge/coordinator must verify canonical serialization and hash-to-allocation correspondence before submission, and deployment evidence must not claim otherwise.

Contract `TaskStatus.ManualReview` means task funds await an explicit reviewed release. It is not the shared domain `CaseStatus.ManualReview`: after funds are released, the contract task becomes `Settled`, while the domain case may remain terminal `ManualReview` to preserve the fact that human review was required.

## Deployment safety

The Gate 3 chain-ID guard was removed only after the acceptance, settlement, refund, authorization, authority recovery, evidence-hash, duplicate-settlement, deferred-payment withdrawal, and reentrancy paths passed the Gate 4 Foundry suite. A cold run currently executes 33 tests, including two 1,000-run funding/allocation fuzz tests and a 1,000-run stateful invariant covering 500,000 randomized lifecycle calls. The suite also covers the post-deadline delivery/refund race, failed-recipient fallback, deferred-withdrawal reentrancy, authority rotation, and cross-task callbacks. The committed Moss-facing ABI and canonical hash remain unchanged.

The contract is deployed on Monad Testnet (`chainId == 10143`). The versioned deployment manifest `deployments/monad-testnet.json` records the address (`0x67040374b8A9756586De0885f01d1291cE8FFCcF`), deployment transaction, block (`49534792`), constructor arguments (separate `settlementAuthority` / `authorityAdmin`), runtime bytecode size and sha256, init-code keccak, and the Moss-facing ABI hash, with `verifiedOnChain` set. The settlement authority and authority admin are separately controlled Testnet accounts; the constructor rejects zero or identical role addresses. This MVP does not use a proxy.

The Moss Protocol Package (`silicon-arbitration`, pinned in `vendor/moss`) and the product `packages/moss-bridge` consume this deployment; a live `action → simulate` against the deployed contract returns a full Change/Receipt with no terminal Warning. The demo case's E3 remains a labeled fixture (`isMock: true`, `confirmed: false`) until a real wallet sign/broadcast round-trip is captured.

## Commands

Create the local environment file and replace the wallet and authority placeholders with dedicated Testnet accounts:

```bash
cp .env.example .env
set -a
source .env
set +a
```

`.env` is ignored by Git; `.env.example` contains variable names and safe defaults only.

```bash
cd contracts
forge fmt --check
forge build
forge test -vvv
python3 script/check_gate3_abi.py
```

Deployment evidence and the versioned Monad Testnet manifest live in `deployments/monad-testnet.json`; keep that file in sync whenever the contract or its ABI changes. Do not place private keys or funded wallet exports in this repository.
