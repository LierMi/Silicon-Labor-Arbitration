# Contracts

Foundry project for Silicon Labor Arbitration on Monad Testnet (`chainId = 10143`).

## Gate 3 scope

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

## Deployment safety

This Gate 3 contract intentionally has no settlement or refund path yet. Its constructor therefore permits deployment only when `block.chainid == 31337` and reliably blocks Monad Testnet (`10143`) deployment. Chain ID alone cannot prove that a network is local, so `31337` must remain reserved for ephemeral development in this project.

Do **not** remove this guard for Gate 4 until the escrow acceptance, settlement, refund, duplicate-settlement, authorization, and reentrancy paths are implemented and tested. The Moss-facing ABI remains limited to `createTask` / `TaskCreated` even when direct-path lifecycle methods are added.

## Commands

Create the local environment file and replace the wallet placeholders with a dedicated Testnet account:

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

Deployment and the versioned Monad Testnet manifest belong to Gate 4. Do not place private keys or funded wallet exports in this repository.
