<div align="center">

# Silicon Labor Arbitration

### Evidence-backed responsibility infrastructure for the Agent economy

**Deterministic rules settle what is measurable. AI explains the evidence. Humans keep the final say.**

[![English](https://img.shields.io/badge/English-current-4f46e5)](./README.md)
[![简体中文](https://img.shields.io/badge/简体中文-README-64748b)](./README.zh-CN.md)

[![Public Demo](https://img.shields.io/badge/Public_Demo-Open-4f46e5)](https://silicon-labor-arbitration.vercel.app/)
[![Monad Testnet](https://img.shields.io/badge/Monad_Testnet-10143-836EF9)](https://testnet.monadexplorer.com/address/0x67040374b8A9756586De0885f01d1291cE8FFCcF)
[![Next.js](https://img.shields.io/badge/Next.js-15.5.22-000000?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-149ECA?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.2-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-22c55e)](./LICENSE)

[Live Experience](https://silicon-labor-arbitration.vercel.app) · [Case Workbench](https://silicon-labor-arbitration.vercel.app/workbench) · [Courtroom](https://silicon-labor-arbitration.vercel.app/courtroom) · [Contract](https://testnet.monadexplorer.com/address/0x67040374b8A9756586De0885f01d1291cE8FFCcF)

</div>

---

## 30-Second Overview

Silicon Labor Arbitration is an on-chain accountability layer for work delegated through AI Agents. When a task passes from a human to a coordinator Agent, a specialist Agent, tools, and a wallet, responsibility can disappear between the handoffs. This project reconstructs that chain as verifiable evidence instead of asking another AI to issue a final judgment.

| | What it means |
| --- | --- |
| **Positioning** | An evidence-backed responsibility timeline and settlement system for Agent-delivered work—not an AI court. |
| **Core innovation** | Objective requirements can drive deterministic settlement; subjective requirements remain `undecidable` and retain human review. |
| **Moss integration** | Moss builds and simulates the unsigned `createTask` transaction before signing; the wallet remains the signing and broadcasting boundary. |
| **Monad-native value** | Escrow state, commitments, lifecycle events, and settlement evidence are recorded on Monad Testnet with task-scoped state. |
| **Primary demo** | A commissioned “orange cat” is delivered as a potato: format checks pass, meaning does not. The system refuses to fake certainty. |

> **We do not issue final judgments. We recover responsibility and put it in front of the human reviewer.**

## Why We Built This

Our story begins with a cat.

A user pays 0.2 MON and asks an Agent to draw an orange cat suitable for a children's product. The Agent delivers on time: a PNG with a transparent background, perfectly compliant in format—but what it delivers is a potato.

It can even explain, with all the polish of a contemporary artist: “This is a postmodern reconstruction of the concept of the cat.” From an artistic perspective, it almost sounds convincing.

The name SILICON LABOR ARBITRATION (SLA) is itself a pun: SLA also means Service Level Agreement. At heart, the potato case is an SLA dispute—was the promised level of service actually met?

Transaction records can prove where the money went, and signatures can prove who clicked confirm. But neither can answer: at what point was human intent misunderstood? When every machine has “executed correctly,” who is responsible for the wrong result?

In the Agent era, **what is truly scarce is responsibility**.

That is why we built Silicon Labor Arbitration. We are not rushing to decide who is right or wrong. We are here to **reconstruct an undeniable timeline of responsibility**.

In our early research, we found Internet Court, a product launched this July that uses 1,001 AI jurors to reach final verdicts quickly. Our view is different: more AI does not automatically produce justice. **Truth is not necessarily held by the majority of Agents. A vote can produce an answer, but it cannot confer legitimacy upon it.**

So Silicon Labor Arbitration does not invent an omniscient AI judge. It reconstructs responsibility: who stated the requirement, who accepted the assignment, who called the tool, who signed the transaction, and who delivered the potato.

Technically, Monad Testnet carries escrow and responsibility records, Moss constructs and simulates transactions before signing, and the wallet preserves the final authorization boundary.

**What we seek to protect is not merely a payment, but the last right that must not be automated in the AI era: humanity's final authority to interpret meaning.**

## Problem

Agentic work creates a long delegation chain:

```text
Human intent
  → coordinator Agent
    → specialist Agent
      → third-party tool
        → transaction or delivery
          → wallet and payment
```

When the result is wrong, every participant can point to the previous instruction. A valid signature proves that a transaction was authorized; it does not prove that the final work matched the original intent.

Existing approaches often ask AI juries to produce a definitive answer. Silicon Labor Arbitration takes the opposite position: **facts should be reconstructed, measurable commitments should be enforced deterministically, and subjective meaning should remain open to human review.**

## Solution

The protocol separates responsibility into three layers:

| Layer | Responsibility | Can move funds? |
| --- | --- | :---: |
| **On-chain evidence** | Task creation, escrow, Agent assignment, delivery hash, dispute, settlement commitments, and lifecycle events | Through contract rules |
| **Deterministic rules** | Deadline, file format, alpha channel, authorization, amount conservation, and other objective checks | **Yes** |
| **AI explanation and human review** | Evidence-cited prosecution, defense, and audit views; review of subjective conditions | **No** |

```text
objective condition  → satisfied / violated / undecidable from missing evidence
subjective condition → always undecidable → human review
```

## Main Use Cases

- **Agent outsourcing**: reconstruct what a client requested, what an Agent accepted, which warnings were visible, and what was delivered.
- **DAO and team procurement**: escrow payment against measurable delivery requirements while preserving human review for quality and intent.
- **Automated service SLAs**: settle objective failures such as deadlines and file properties without pretending that code can judge subjective meaning.
- **Agent audit and incident review**: produce a tamper-evident timeline for operators, compliance teams, and framework developers.

## Key Highlights

### 1. Honest uncertainty is a product feature

In the demo case, C1–C3 are measurable and can be evaluated. C4—“does the delivery depict a cat?”—is subjective and must remain `undecidable`. The empty verdict stamp is the product’s trust boundary, not an unfinished feature.

### 2. Moss is load-bearing, not branding

The task-creation path uses the pinned team fork of [Moss](https://github.com/LierMi/moss):

```text
discover → load → action → simulate → pre-sign evidence (E3)
```

Moss prepares and simulates the unsigned `TaskEscrow.createTask` transaction. It **never** stores a private key, signs, broadcasts, or decides a dispute. The product blocks the signing path when simulation reverts or returns a terminal warning.

### 3. The wallet is the signing boundary

The wallet must receive the same `chainId`, `to`, `data`, and `value` that Moss simulated. Post-sign receipt data is linked back to the pre-sign E3 record so the project can prove what was explained before approval.

### 4. AI explains evidence but cannot allocate money

The AI output schema contains only `role`, `text`, `cites`, and `uncertain`. Settlement amounts and requirement weights are removed from model input. Opinions with missing or unknown evidence citations are rejected.

### 5. Settlement preserves subjective value

The contract enforces amount conservation:

```text
toAgent + toClient + frozen = escrowed
```

Funds associated with unresolved subjective conditions can remain frozen until an explicit human review commitment is submitted.

## Demo

| Entry | Purpose |
| --- | --- |
| [Landing page](https://silicon-labor-arbitration.vercel.app/) | Product thesis and narrative entry |
| [Interactive experience](https://silicon-labor-arbitration.vercel.app/demo) | Six-act responsibility reconstruction |
| [Case workbench](https://silicon-labor-arbitration.vercel.app/workbench) | Wallet-driven task lifecycle and demo Agent actions |
| [Courtroom](https://silicon-labor-arbitration.vercel.app/courtroom) | Evidence timeline, deterministic findings, AI arguments, and human review boundary |

### Demo data modes

| Mode | What is real | UI label |
| --- | --- | --- |
| **Demo fixture** (default) | Deployed contract and implementation; the displayed case narrative is a fixed fixture and is not broadcast | `DEMO` |
| **Hybrid** | Task status and amount are read from Monad Testnet; the evidence narrative remains demo data | `HYBRID` |

Append `?taskId=0x...` to the experience or courtroom URL to force the live chain reader for a specific task. If the read fails, the UI falls back to the clearly labeled demo fixture.

**Demo account**: none. The narrative can be explored without an account. Chain writes require a browser wallet connected to Monad Testnet and funded with testnet MON.

## End-to-End Flow

```text
1. Client defines requirements, deadline, and escrow amount
2. Requirements are canonically hashed
3. Moss loads silicon-arbitration.createTask
4. Moss builds the unsigned transaction and simulates it on Monad Testnet
5. The application generates E3 pre-sign evidence
6. The client reviews and signs the exact simulated transaction in a wallet
7. TaskEscrow records the task, funds, and TaskCreated event
8. An assigned Agent submits a delivery commitment
9. Objective rules evaluate measurable evidence
10. Subjective requirements remain undecidable
11. Deterministic settlement pays, refunds, or freezes funds
12. A human may release the frozen portion with a review commitment
```

## Architecture

<p align="center">
  <img src="./docs/diagrams/architecture.svg" alt="Silicon Labor Arbitration system architecture" width="100%">
</p>

```text
Browser / Wallet
  ├── Next.js experience and workbench
  ├── wagmi + viem wallet boundary
  └── DEMO / HYBRID case adapter
            │
            ▼
Product modules
  ├── @sla/domain       shared case and evidence contracts
  ├── @sla/rules        deterministic objective rule engine
  ├── @sla/ai           evidence-cited explanation layer
  ├── @sla/chain        ABI, reads, and direct lifecycle writes
  └── @sla/moss-bridge  prepare → simulate → E3
            │
            ▼
Pinned team Moss fork
  └── Monad Testnet Runtime + silicon-arbitration Protocol
            │
            ▼
Monad Testnet
  └── TaskEscrow
```

### Moss and direct transaction boundaries

| Operation | Path | Evidence label |
| --- | --- | --- |
| `createTask` | Moss Capability → simulation → wallet | Moss E3 |
| `assignAgent`, `submitDelivery`, `acceptDelivery`, `openDispute` | Product transaction builder → wallet | Direct on-chain evidence |
| `settle`, `releaseFrozen`, `withdrawPayment` | Authorized direct contract path | Direct on-chain evidence |

Later lifecycle writes are intentionally not presented as Moss-verified operations.

## On-Chain Evidence

Deployment data comes from [`deployments/monad-testnet.json`](./deployments/monad-testnet.json).

| Field | Value |
| --- | --- |
| Network | Monad Testnet |
| Chain ID | `10143` (`0x279f`) |
| Contract | [`TaskEscrow`](https://testnet.monadexplorer.com/address/0x67040374b8A9756586De0885f01d1291cE8FFCcF) |
| Address | `0x67040374b8A9756586De0885f01d1291cE8FFCcF` |
| Deployment transaction | [`0xb96e...96e34`](https://testnet.monadexplorer.com/tx/0xb96eecedc5038735c40aa9918c3369f829bb3b93468d38b3b66f87ce9e896e34) |
| Deployment block | `49534792` |
| Runtime bytecode | `6021` bytes |
| Moss-facing ABI hash | `0xce8965794b678d101ae433472fb8d7e536fc0254386e00fabef36aaa66b73cf5` |
| Pinned Moss commit | `b00ed2db0454219e468e8a0e4928c364a869fb79` |

E3 preserves the Capability parameters, unsigned transaction, simulation receipt, warnings, pre-sign explanation, chain ID, contract address, ABI hash, Moss revision, Protocol version, sanitized RPC fingerprint, and canonical payload hash.

## Main Features

- Funded task creation with requirement and deadline commitments.
- Client-controlled Agent assignment and Agent-only delivery submission.
- Delivery acceptance, expired-task refund, and participant dispute opening.
- Deterministic rule evaluation for objective requirements.
- Mandatory `undecidable` output for subjective requirements.
- Evidence-cited prosecution, defense, and audit explanations.
- Evidence-linked settlement with subjective-fund freezing.
- Human-reviewed frozen-fund release.
- Deferred claimable payments when a direct push transfer fails.
- Task-scoped reentrancy protection and two-step settlement-authority rotation.
- Mock and live-chain adapters without component rewrites.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Web application | Next.js 15.5.22, React 19.2.8, TypeScript 5.6.2 |
| Interaction | GSAP, TanStack Query |
| Wallet and chain | wagmi 2.12.20, viem 2.55.10 |
| Smart contract | Solidity 0.8.24, Foundry, Cancun EVM target |
| Agent transaction simulation | Moss team fork, custom Monad Testnet Runtime, `silicon-arbitration` Protocol Package |
| Domain and rules | TypeScript workspace packages with canonical evidence hashing |
| AI explanation | Anthropic-compatible SDK; Gonka default, Anthropic fallback |
| Network | Monad Testnet only |
| Deployment | Vercel for the Next.js application; Foundry for contracts |

## Repository Structure

```text
.
├── apps/web/                 Next.js UI, API routes, DEMO/HYBRID adapters
├── contracts/                TaskEscrow, Foundry tests, deployment scripts, ABI
├── deployments/              Versioned Monad Testnet deployment evidence
├── packages/
│   ├── ai/                   Evidence-cited AI explanations
│   ├── chain/                Chain config, ABI, tx builders, wagmi hooks
│   ├── domain/               Shared Case, Evidence, RuleResult, and E3 types
│   ├── moss-bridge/          Stable product boundary around Moss
│   └── rules/                Deterministic objective rule engine
├── scripts/                  E2E and concurrency evidence scripts
├── vendor/moss/              Pinned team Moss fork submodule
├── docs/                     Product, architecture, risk, and demo documents
├── moss.lock.json            Moss provenance lock
└── pnpm-workspace.yaml       Monorepo workspace definition
```

## Quick Start

### Prerequisites

- Node.js 22 recommended (`package.json` requires Node.js 20 or newer)
- pnpm `11.15.1`
- Git with submodule support
- [Foundry](https://getfoundry.sh/) for contract builds and tests
- A browser wallet and testnet MON for on-chain writes

### Install

```bash
git clone --recurse-submodules https://github.com/LierMi/Silicon-Labor-Arbitration.git
cd Silicon-Labor-Arbitration
corepack enable
pnpm install
```

If the repository was cloned without submodules:

```bash
git submodule update --init --recursive
pnpm install
```

The submodule step must happen before pnpm resolves the workspace because `pnpm-workspace.yaml` includes packages under `vendor/moss`.

### Run the web application

```bash
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @sla/web dev
```

Open `http://localhost:3000`. The default case source is the clearly labeled demo fixture.

### Run verification

```bash
pnpm verify
pnpm test:contracts
```

`pnpm verify` builds the required Moss packages, type-checks the product workspaces, runs package tests, and builds the Next.js app. Foundry is required only for `pnpm test:contracts`.

## Configuration

### Web and demo

| Variable | Required | Default | Purpose |
| --- | :---: | --- | --- |
| `NEXT_PUBLIC_CASE_SOURCE` | No | `mock` | Selects `mock` or `live` case data. |
| `NEXT_PUBLIC_LIVE_TASK_ID` | No | Latest task in the 20,000-block scan window | Selects a specific live `bytes32` task ID. |
| `DEMO_AGENT_ACTION_ENABLED` | No | Enabled unless set to `false` | Controls the server-side demo Agent action endpoint. |
| `DEPLOYER_PRIVATE_KEY` | Conditional | None | Required by hosted demo Agent actions and contract deployment. Use a testnet-only key. |

### AI explanation regeneration

The checked-in potato-case demo uses a frozen, traceable AI fixture and does not call a model during the presentation.

| Variable | Required | Default | Purpose |
| --- | :---: | --- | --- |
| `GONKA_API_KEY` | Conditional | None | Regenerates AI arguments through Gonka. |
| `GONKA_BASE_URL` | No | `https://api.gonkarouter.io` | Anthropic-compatible API host. |
| `GONKA_MODEL` | No | `moonshotai/Kimi-K2.6` | Gonka model identifier. |
| `ANTHROPIC_API_KEY` | Conditional | None | Fallback provider when Gonka is not configured. |
| `ANTHROPIC_MODEL` | No | `claude-opus-5` | Anthropic model identifier. |

### Contract deployment

Copy `contracts/.env.example` to `contracts/.env` and provide a testnet-only deployer plus distinct settlement authority and authority admin addresses. Never reuse a wallet that holds mainnet assets.

## Available Commands

| Command | Description |
| --- | --- |
| `pnpm --filter @sla/web dev` | Start the Next.js development server. |
| `pnpm build:web` | Create the production web build. |
| `pnpm build:moss` | Build only the Moss packages required by the product. |
| `pnpm typecheck` | Build Moss dependencies and type-check all product packages/apps. |
| `pnpm test` | Build Moss dependencies and run product package tests. |
| `pnpm test:contracts` | Run the Foundry contract suite. |
| `pnpm verify` | Run Moss build, typecheck, package tests, and web build. |
| `npx tsx scripts/concurrency-demo.ts 30` | Submit independent testnet tasks and record transaction evidence. |
| `cd scripts && npm install && npx tsx e2e-verify.ts` | Exercise the direct task lifecycle with testnet accounts. |

## Deployment

### Web application on Vercel

The public deployment is [silicon-labor-arbitration.vercel.app](https://silicon-labor-arbitration.vercel.app/).

| Setting | Value |
| --- | --- |
| Root directory | Repository root |
| Install command | `pnpm install` |
| Build command | `pnpm build:web` |
| Framework | Next.js |

Ensure Git submodules are available during checkout. Set `DEPLOYER_PRIVATE_KEY` only if the demo-only Agent action endpoint is required. For a non-demo deployment, set `DEMO_AGENT_ACTION_ENABLED=false` and use real Agent wallets instead of server-side signing.

### Smart contract

```bash
cd contracts
cp .env.example .env
forge build
forge test -vvv
forge script script/DeployTaskEscrow.s.sol:DeployTaskEscrow \
  --rpc-url "$MONAD_TESTNET_RPC_URL" \
  --broadcast
```

Deployment is restricted to Monad Testnet. Record any new address, transaction, block, bytecode hash, and ABI hash in `deployments/monad-testnet.json` before updating this README.

## Security and Truth Boundaries

| The system can prove | The system does not claim |
| --- | --- |
| Which task and requirement commitments were placed on-chain | That a hash proves the semantic quality of off-chain content |
| Which unsigned transaction Moss simulated | That Moss signed, broadcast, or judged the transaction |
| Which wallet transaction was confirmed and which events were emitted | That a valid signature proves the result matched human intent |
| How objective rules produced a settlement proposal | That AI independently verified or selected the payment amounts |
| Which facts were unavailable or subjective | That subjective meaning can be converted into an objective verdict |

- Monad Testnet only; no mainnet funds or mainnet constants belong in the demo path.
- Private keys, API keys, seed phrases, and `.env*` files must never be committed.
- The server-side Agent signer is strictly a labeled demo convenience, not the production trust model.
- Off-chain evidence bodies require reproducible canonical serialization and hashes.
- Concurrency scripts report captured transaction facts, not unverified TPS or finality claims.

## Current Limitations

- Moss is intentionally integrated only for `createTask`; later writes use direct viem/wagmi paths.
- The default hosted experience is a demo fixture. Live task reads are labeled `HYBRID` because the accompanying narrative evidence is still a fixture.
- The demo Agent action endpoint derives funded testnet Agent accounts from a server-held demo key. Production deployments must replace it with independent Agent wallets.
- The repository does not provide a production indexer or decentralized evidence-body storage.
- Human review governance is represented by an authorized on-chain witness and evidence commitment; it is not yet a decentralized reviewer network.
- The project never resolves C4 (“is the delivery a cat?”) automatically.

## Roadmap

| Stage | Direction |
| --- | --- |
| **Today** | Testnet escrow, Moss-simulated task creation, responsibility timeline, deterministic rules, AI evidence explanations, and human-review freeze/release path. |
| **Next** | Replace hybrid narrative mappings with fully captured live evidence, add durable indexing, and harden independent Agent signing. |
| **Vision** | A reusable responsibility and settlement layer for Agent frameworks, procurement systems, and regulated operators. |

## Commercial Path

- **Target customers**: Initially focused on Agent platforms and automated outsourcing platforms, then expanding to DAOs, enterprise AI procurement teams, and compliance teams.
- **Core value**: Infrastructure for pre-transaction commitments, responsibility tracing, dispute-based fund allocation, and human review in Agent transactions.
- **Business model**: Protocol fees on protected escrow transactions, with enterprise subscriptions priced by API usage, case volume, or compliance seats.
- **Go-to-market**: Start with high-value Agent engagements whose acceptance criteria can be structured, then expand into a cross-platform responsibility and settlement layer.
- **Long-term moat**: Not “using another AI to judge AI,” but progressively building verifiable responsibility chains, reusable rule templates, and a dispute-resolution network through real transactions.

**Internet Court sells adjudication, ERC-8004 records identity, and ERC-7710 manages delegation; Silicon Labor Arbitration sells what is scarcest before adjudication—facts that are trustworthy, complete, and attributable.**

## Documentation

| Document | Scope |
| --- | --- |
| [`docs/01-项目方案.md`](./docs/01-项目方案.md) | Product position and non-negotiable principles |
| [`docs/02-开发执行案.md`](./docs/02-开发执行案.md) | Delivery scope and implementation plan |
| [`docs/05-双仓库架构与Moss-Testnet集成.md`](./docs/05-双仓库架构与Moss-Testnet集成.md) | Product/Moss repository topology and runtime architecture |
| [`docs/06-技术风险与决策清单.md`](./docs/06-技术风险与决策清单.md) | Risks, decisions, owners, and evidence gates |
| [`docs/08-Moss边界与职责划分.md`](./docs/08-Moss边界与职责划分.md) | Accepted Moss boundary: `createTask` only for P0 |
| [`AGENTS.md`](./AGENTS.md) | Repository invariants and contributor guardrails |

## Team

| Member | Focus |
| --- | --- |
| **NEO** | Smart contracts, Moss, and on-chain integration |
| **RISO** | Product, deterministic rules, AI explanation, coordination, UI, and frontend development |
| **ELEVEN** | UI, visual design, and interaction |

For collaboration on Agent frameworks, verification infrastructure, or real-world design-partner workflows, contact [NEO on Telegram](https://t.me/neo_web3_nova) or [RISO on Telegram](https://t.me/Lier_Mi).

## Contributing

1. Fork the repository and create a focused branch.
2. Preserve the product invariants in [`AGENTS.md`](./AGENTS.md).
3. Keep Moss internals behind `@sla/moss-bridge` and shared domain types in `@sla/domain`.
4. Run `pnpm verify` and the relevant Foundry tests.
5. Open a pull request with the behavior, trust boundary, and verification evidence clearly described.

## License

This project is licensed under the [MIT License](./LICENSE).

The software is experimental and deployed on Monad Testnet. It is not legal advice, a court judgment, or a production custody service.

---

<div align="center">

**What we seek to protect is not merely a payment, but the last right that must not be automated in the AI era: humanity's final authority to interpret meaning.**

</div>
