# Silicon Labor Arbitration agent instructions

## Project identity

- Canonical product repository: `https://github.com/LierMi/Silicon-Labor-Arbitration`.
- Product name: Silicon Labor Arbitration / 硅基劳动仲裁院.
- Hackathon network: **Monad Testnet only**. Do not deploy or demonstrate this project on Monad Mainnet unless the team explicitly changes this decision.
- Monad Testnet chain ID: `10143` (`0x279f`). Default public RPC: `https://testnet-rpc.monad.xyz`.
- Moss upstream: `https://github.com/nishuzumi/moss`.
- Team Moss fork: `https://github.com/LierMi/moss`.
- Team: NEO (contracts, Moss, on-chain integration), RISO (product, deterministic rules, AI explanation, coordination), ELEVEN (UI, visual design, interaction).

Before any write, commit, push, deployment, or GitHub action, verify:

```bash
pwd
git rev-parse --show-toplevel
git remote -v
git status --short --branch --untracked-files=all
```

Never infer the target repository from a directory name. The product repo, the team Moss fork, the official Moss upstream, and any parent internship repository have separate histories and scopes.

## Product invariants

1. **We do not issue final judgments.** The system reconstructs an evidence-backed responsibility timeline. Deterministic rules may move or freeze funds only for objectively measurable conditions; subjective conditions remain `undecidable` and require human review.
2. **Moss is a core dependency, not decorative branding.** The task-creation path must use a Moss Protocol Capability to build and simulate the unsigned transaction before wallet signing.
3. **The wallet is the signing boundary.** Moss never signs or broadcasts. The user must review the simulation result and explicitly sign with a wallet.
4. **Moss evidence is preserved.** The pre-sign explanation, structured simulation result, Capability parameters, chain ID, contract address, Moss commit, Protocol version, and content hash form evidence `E3`.
5. **No fake evidence or performance claims.** Mock data must be visibly labeled. Any concurrency or performance metric must come from captured transactions; inferred metrics must be labeled as inference.
6. **The C4 subjective condition stays unresolved.** “Is the delivery a cat?” remaining undecidable is a core product statement, not a missing feature to optimize away.

## Source-of-truth documents

Read these before implementation:

1. `docs/01-项目方案.md` — product position and non-negotiable principles.
2. `docs/02-开发执行案.md` — delivery scope, responsibilities, and schedule.
3. `docs/05-双仓库架构与Moss-Testnet集成.md` — repository topology and runtime architecture.
4. `docs/06-技术风险与决策清单.md` — current blockers, evidence, owners, and decision gates.
5. `docs/08-Moss边界与职责划分.md` — accepted P0 boundary: Moss only for `createTask`; later writes use the direct transaction path.

When documents conflict, the order above does not decide automatically. Preserve the product invariants in this file, record the conflict in `docs/06-技术风险与决策清单.md`, and obtain a team decision before changing architecture.

## Repository boundaries

### Product repository owns

- Next.js application and wallet UI.
- Server-side Moss bridge used by the application.
- Solidity contracts, Foundry tests, deployment scripts, and deployed-address manifests.
- Deterministic rule engine, AI explanation layer, domain schemas, demo fixtures, and project documentation.
- The pinned Moss revision used by the demo.

### Team Moss fork owns

- Monad Testnet Runtime support required by this project.
- `silicon-arbitration` Protocol Package: ABI provenance, Capability definitions, Queries, Receipt parsers, and adapter tests.
- MCP server composition changes needed to register the Protocol Package.
- Changes intended for possible contribution back to official Moss.

### Official Moss upstream owns

- Moss framework architecture and accepted vocabulary.
- Core, simulator, system, ERC, MCP and Protocol contracts unless the team fork explicitly diverges.
- Upstream ADRs, security constraints, contribution rules, and package conventions.

Do not copy Moss source files into the product tree. Do not merge the two Git histories. Use a team fork and a pinned Git submodule under `vendor/moss` once the fork exists.

## Moss Testnet rule

Official Moss upstream at commit `2e7c1dbeb5e6f3b1492455034e3b0348a3c0094d` is Mainnet-only: `createRuntime` rejects any chain ID other than `143`, and `@themoss/system` contains Mainnet constants. Therefore:

- Treat Monad Testnet support as a deliberate team-fork extension, not as an already-supported upstream configuration switch.
- Add an explicit Testnet Runtime; do not replace or silently reinterpret Mainnet constants.
- Keep Testnet addresses in a separate module and verify chain ID `10143` at runtime.
- Do not register Mainnet-only Protocol packages or constants in the Testnet composition root.
- Verify the selected Testnet RPC supports the trace methods required by the Moss simulator.
- Keep the divergence small and documented so it can be rebased or proposed upstream later.

## Target module seams

Keep Moss complexity behind one deep product module:

```text
MossBridge.prepareTask(input)
  -> capability
  -> unsignedTransactions
  -> simulation
  -> preSignEvidence
```

Callers must not depend directly on Moss Registry, decorators, Receipt internals, or MCP transport details. UI code consumes the stable product result and hands unsigned transactions to the wallet only when simulation has no terminal Warning.

Use shared domain contracts for `Case`, `Evidence`, `Requirement`, `RuleResult`, `SettlementProposal`, `MossPreSignEvidence`, and `CaseStatus`. Do not define competing versions in UI, rules, and chain-integration code.

## Cross-repository change sequence

For changes that affect both contracts and Moss:

1. Freeze the Solidity interface and events in the product repo.
2. Implement and test the contracts on Monad Testnet.
3. Publish verified Testnet deployment addresses and ABI hashes in the product repo.
4. Implement or update the Protocol Package in the team Moss fork.
5. Run Moss build, typecheck, lint, offline tests, and Testnet live simulation.
6. Merge the Moss-fork change and obtain an immutable commit SHA.
7. Update the product repo’s `vendor/moss` pointer and Moss lock manifest in a separate product PR.
8. Run the product end-to-end path: prepare → simulate → explain → wallet sign → broadcast → confirm event → persist evidence.

Never develop long-lived changes on a detached submodule HEAD. Work in a normal clone or worktree of the team Moss fork, push the branch there, then update the product repo’s submodule pointer.

## Team collaboration

Default ownership:

- NEO: `contracts/`, `packages/moss-bridge/`, `vendor/moss`, deployment manifests, cross-chain integration tests.
- RISO: `packages/domain/`, `packages/rule-engine/`, server-side AI explanation code, demo data, product coordination.
- ELEVEN: `apps/web/`, UI assets, interaction, animation, loading/error/empty states.

Shared interfaces require review from every affected owner. UI development must use a typed mock adapter until the live adapter is available; switching from mock to live must not require component rewrites.

Use short feature branches and pull requests. Keep `main` demonstrable. Stage explicit paths only; never use broad staging in a dirty or shared worktree. Do not commit, push, rewrite history, or alter GitHub settings unless the user explicitly requests it.

## Verification gates

### Product repository

Run the relevant subset and expand to the full suite before merge:

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test
forge test
```

Also verify:

- Runtime reports chain ID `10143`.
- Contract addresses contain deployed bytecode on Monad Testnet.
- ABI hashes match the contracts consumed by the Moss Protocol Package.
- A real Testnet `createTask` Capability simulates without Warning.
- The wallet receives exactly the transaction Moss simulated.
- The confirmed transaction emits the expected event and E3 points to the exact pre-sign evidence.

### Moss fork

Follow that repository’s own `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, ADRs, and contribution rules. At minimum:

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test:offline
```

Then run the project-specific Testnet live simulation. Build precedes typecheck because Moss workspace packages resolve generated declarations.

## Secrets and generated data

- Never commit private keys, seed phrases, API keys, funded test accounts, `.env*`, or raw wallet exports.
- Commit `.env.example` with names and safe defaults only.
- Deployed addresses, transaction hashes, ABI hashes, chain IDs, and public RPC URLs are evidence, not secrets; record them in a versioned deployment manifest.
- Off-chain evidence bodies may remain local for the demo, but their canonical serialization and hashes must be reproducible.
