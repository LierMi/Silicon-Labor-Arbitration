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

The contract is now deployable when `chainId == 10143`, but no real Monad Testnet deployment is claimed until a deployment transaction, confirmed bytecode, block number, and versioned manifest are captured. The settlement authority and authority admin must be separately controlled Testnet accounts (preferably multisigs); the constructor rejects zero or identical role addresses. This MVP does not use a proxy.

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

Deployment and the versioned Monad Testnet manifest are the remaining Gate 4 evidence. Do not place private keys or funded wallet exports in this repository.
