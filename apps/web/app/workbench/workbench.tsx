"use client";

/**
 * 任务工作台 —— live 全流程（创建 → 指派 → 交付 → 验收 → 争议 → 结算）
 *
 * 签名边界（AGENTS.md）：createTask 的 unsigned tx 来自服务端 Moss 桥
 * （Moss 只模拟，不签名不广播）；这里用钱包签原始交易并广播。
 * 后续写操作走 chain 包 direct hooks（viem），不标 Moss verified。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect, useSendTransaction, useReadContract, useWriteContract } from "wagmi";
import {
  TASK_ESCROW_ADDRESS,
  taskEscrowAbi,
  buildAssignAgent,
  buildSubmitDelivery,
  buildAcceptDelivery,
  buildOpenDispute,
} from "@sla/chain";
import { POTATO_REQUIREMENTS, computeRequirementsHash, deadlineFromNow } from "@sla/domain";
import type { Requirement } from "@sla/domain";
import { formatEther, isAddress } from "viem";

const CHAIN_ID = 10143;
const REQUIRED_AMOUNT = "0.1";
/** e2e-verify 用的固定交付哈希（演示用；真实流程应来自交付文件指纹） */
const DELIVERY_HASH = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const STATUS_LABELS: Record<number, string> = {
  0: "None", 1: "Created", 2: "Delivered", 3: "Disputed", 4: "ManualReview", 5: "Accepted", 6: "Settled", 7: "Refunded",
};

type Prepared = {
  unsignedTransaction: { to: string; data: string; value: string; from: string };
  estimatedGas: string;
  simulationFailed: boolean;
  warnings: string[];
  evidenceHash: string | null;
  receipt: unknown;
  capabilityParams: Record<string, unknown>;
  rpcFingerprint: string;
  intent?: {
    intent: string;
    verb: string;
    category: string;
    risk: string[];
    tags: string[];
  };
  e3?: {
    explanation: string;
    canonicalPayloadHash: string;
    mossCommit: string;
    protocolVersion: string;
    contractAddress: string;
    abiHash: string;
    chainId: number;
  };
};

// ── 读链上任务状态 ─────────────────────────────────────────
function useTaskStatus(taskId: `0x${string}` | undefined) {
  const { data } = useReadContract({
    address: TASK_ESCROW_ADDRESS,
    abi: taskEscrowAbi,
    functionName: "getTaskStatus",
    args: taskId ? [taskId] : undefined,
    query: { enabled: Boolean(taskId), refetchInterval: 4000 },
  });
  return data === undefined ? null : Number(data);
}

function useTaskDetails(taskId: `0x${string}` | undefined) {
  const { data } = useReadContract({
    address: TASK_ESCROW_ADDRESS,
    abi: taskEscrowAbi,
    functionName: "tasks",
    args: taskId ? [taskId] : undefined,
    query: { enabled: Boolean(taskId), refetchInterval: 4000 },
  });
  if (!data) return null;
  const t = data as unknown as [
    `0x${string}`, `0x${string}`, bigint, `0x${string}`, `0x${string}`, `0x${string}`, bigint,
  ];
  return {
    client: t[0],
    agent: t[1],
    amount: formatEther(t[2]),
    deliveryHash: t[4],
    caseId: t[5],
    deadline: new Date(Number(t[6]) * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
  };
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export default function Workbench() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<`0x${string}` | undefined>(undefined);
  const [agentAddress, setAgentAddress] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);

  // 需求条款表单：默认预填土豆案 C1-C4，用户可增删改
  const [requirements, setRequirements] = useState<Requirement[]>(() =>
    POTATO_REQUIREMENTS.map((r) => ({ ...r })),
  );
  const requirementsHash = useMemo(() => computeRequirementsHash(requirements), [requirements]);
  const weightsOk = requirements.reduce((s, r) => s + r.weightBps, 0) === 10000;
  const updateReq = (i: number, patch: Partial<Requirement>) => {
    setRequirements((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const { sendTransactionAsync, isPending: isSending } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  // 用 tx.ts 纯函数构造 + 本文件的 wagmi 实例签名（避免跨包 wagmi 双实例 context 不互通）
  const write = useCallback(
    (request: ReturnType<typeof buildAssignAgent>) => writeContractAsync(request as never),
    [writeContractAsync],
  );

  const status = useTaskStatus(taskId);
  const details = useTaskDetails(taskId);

  const run = useCallback(async (action: () => Promise<`0x${string}`>) => {
    setActionError(null);
    try {
      setTxHash(await action());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // 创建任务：调服务端 Moss 桥拿 unsigned tx + E3
  const prepareTask = useCallback(async () => {
    if (!address) return;
    if (!weightsOk) {
      setPrepareError("条款权重之和必须 = 10000（100%），当前不满足");
      return;
    }
    setPreparing(true);
    setPrepareError(null);
    setPrepared(null);
    try {
      const deadline = deadlineFromNow(2).toString();
      const res = await fetch("/api/moss/prepare-create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: address,
          amountMon: REQUIRED_AMOUNT,
          requirementsHash,
          deadline,
          requirements: requirements.map(({ id, type, label, weightBps }) => ({ id, type, label, weightBps })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPrepared(body);
    } catch (err) {
      setPrepareError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreparing(false);
    }
  }, [address, requirementsHash, weightsOk]);

  // 签名并广播 Moss 模拟出的那笔 unsigned tx
  const signAndCreate = useCallback(async () => {
    if (!prepared) return;
    await run(async () => {
      const { to, data, value } = prepared.unsignedTransaction;
      return sendTransactionAsync({ to: to as `0x${string}`, data: data as `0x${string}`, value: BigInt(value) });
    });
  }, [prepared, sendTransactionAsync, run]);

  const doAssign = useCallback(() => {
    if (!taskId || !isAddress(agentAddress)) return;
    run(() => write(buildAssignAgent(taskId, agentAddress as `0x${string}`)));
  }, [taskId, agentAddress, write, run]);

  const doSubmit = useCallback(() => {
    if (!taskId) return;
    run(() => write(buildSubmitDelivery(taskId, DELIVERY_HASH)));
  }, [taskId, write, run]);

  const doAccept = useCallback(() => {
    if (!taskId) return;
    run(() => write(buildAcceptDelivery(taskId)));
  }, [taskId, write, run]);

  const doDispute = useCallback(() => {
    if (!taskId) return;
    run(() => write(buildOpenDispute(taskId)));
  }, [taskId, write, run]);

  const step = useMemo(() => {
    if (status === null) return "idle";
    switch (status) {
      case 1: return "created";
      case 2: return "delivered";
      case 3: return "disputed";
      case 4: return "manual-review";
      case 5: return "accepted";
      case 6: return "settled";
      case 7: return "refunded";
      default: return "none";
    }
  }, [status]);

  // 剧场页全局 overflow:hidden，workbench 需要整页滚动；挂载时解锁，卸载恢复
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "auto";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1.5rem", fontFamily: "var(--font-mono), monospace", color: "#f4efe4", background: "#0b0906", minHeight: "100dvh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.2rem", letterSpacing: "0.08em" }}>任务工作台 · WORKBENCH</h1>
        <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/courtroom" style={{ color: "#d6cdb9" }}>法庭 →</Link>
          <Link href="/" style={{ color: "#d6cdb9" }}>体验 →</Link>
          {isConnected ? (
            <>
              <code style={{ fontSize: "0.75rem" }}>{address?.slice(0, 6)}…{address?.slice(-4)}</code>
              <button onClick={() => disconnect()} type="button" style={btn}>断开</button>
            </>
          ) : (
            <button onClick={() => connect({ connector: connectors[0] })} type="button" style={btn}>连接钱包</button>
          )}
        </nav>
      </header>

      {!isConnected ? (
        <section style={card}>
          <h2>连接钱包开始</h2>
          <p style={{ color: "#b8ae99", fontSize: "0.85rem" }}>链：Monad Testnet ({CHAIN_ID}) · 合约 {TASK_ESCROW_ADDRESS.slice(0, 10)}…</p>
          <p style={{ color: "#b8ae99", fontSize: "0.85rem" }}>浏览器只负责签名；createTask 的交易由服务端 Moss 模拟后交给你签。</p>
        </section>
      ) : (
        <>
          {/* 阶段 1：创建任务（Moss 路径） */}
          <section style={card}>
            <h2>① 创建任务 <span style={{ color: "#7d7462", fontSize: "0.7rem" }}>MOSS PATH</span></h2>
            <p style={{ color: "#b8ae99", fontSize: "0.85rem" }}>
              需求条款（预填土豆案，可增删改；权重之和必须 = 10000）· 托管 {REQUIRED_AMOUNT} MON · 截止 2 小时后
            </p>

            {/* 需求条款编辑器 */}
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {requirements.map((req, i) => (
                <div key={req.id} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <code style={{ fontSize: "0.7rem", color: "#7d7462", width: 34 }}>{req.id}</code>
                  <select
                    value={req.type}
                    onChange={(e) => updateReq(i, { type: e.target.value as Requirement["type"] })}
                    style={{ ...input, width: 110 }}
                    title="objective=客观可判；subjective=主观（保持 undecidable）"
                  >
                    <option value="objective">objective</option>
                    <option value="subjective">subjective</option>
                  </select>
                  <input
                    value={req.label}
                    onChange={(e) => updateReq(i, { label: e.target.value })}
                    placeholder="条款描述，如：在截止时间前交付"
                    style={{ ...input, flex: 1, minWidth: 220 }}
                  />
                  <input
                    value={req.weightBps}
                    onChange={(e) => updateReq(i, { weightBps: Number(e.target.value) || 0 })}
                    type="number"
                    title="权重（基点，1 bps = 0.01%）"
                    style={{ ...input, width: 90 }}
                  />
                  <button
                    onClick={() => setRequirements((rs) => rs.filter((_, j) => j !== i))}
                    type="button"
                    title="删除该条款"
                    style={{ ...btn, padding: "0.3rem 0.5rem", borderColor: "#7d7462", background: "transparent" }}
                  >×</button>
                </div>
              ))}
              <button
                onClick={() => setRequirements((rs) => [
                  ...rs,
                  { id: `C${rs.length + 1}`, type: "objective", check: "custom", expect: true, label: "", weightBps: 0, essential: false },
                ])}
                type="button"
                style={{ ...btn, alignSelf: "flex-start", borderColor: "#7d7462", background: "transparent" }}
              >+ 添加条款</button>
            </div>

            {/* 哈希预览 + 权重校验 */}
            <div style={{ marginTop: 8, fontSize: "0.7rem", color: weightsOk ? "#b8ae99" : "#c0392b" }}>
              requirementsHash: <code style={{ wordBreak: "break-all" }}>{requirementsHash}</code>
              <span style={{ marginLeft: 8 }}>权重合计 {requirements.reduce((s, r) => s + r.weightBps, 0)} / 10000 {weightsOk ? "✓" : "✗"}</span>
            </div>

            {!prepared && (
              <div style={{ marginTop: 10 }}>
                <button onClick={prepareTask} disabled={preparing || !weightsOk} type="button" style={{ ...btn, ...(preparing || !weightsOk ? { opacity: 0.5 } : {}) }}>
                  {preparing ? "Moss 模拟中…" : "① 通过 Moss 准备交易"}
                </button>
              </div>
            )}
            {prepareError && <p style={{ color: "#c0392b", fontSize: "0.8rem" }}>✗ {prepareError}</p>}
            {prepared && (
              <div style={{ marginTop: 12, border: "1px solid rgba(214,205,185,0.2)", padding: 12, borderRadius: 6 }}>
                <p style={{ fontSize: "0.8rem" }}>Moss 模拟完成：{prepared.simulationFailed ? "⚠ 有 Warning" : "✓ 无 Warning"}</p>

                {/* 第 1 层：人话解释（与 E3.explanation 逐字一致） */}
                {prepared.e3?.explanation && (
                  <div style={{ marginTop: 10, border: "1px solid rgba(119,201,139,0.35)", borderRadius: 6, padding: 10, background: "rgba(119,201,139,0.05)" }}>
                    <p style={{ fontSize: "0.7rem", color: "#7d7462", letterSpacing: "0.12em", marginBottom: 6 }}>签名前解释 · PRE-SIGN EXPLANATION（E3 归档原文）</p>
                    <p style={{ fontSize: "0.85rem", lineHeight: 1.7 }}>{prepared.e3.explanation}</p>
                  </div>
                )}

                {/* Intents：Moss Capability 语义元数据 */}
                {prepared.intent && (
                  <div style={{ marginTop: 10, border: "1px solid rgba(192,57,43,0.4)", borderRadius: 6, padding: 10, background: "rgba(192,57,43,0.06)" }}>
                    <p style={{ fontSize: "0.7rem", color: "#7d7462", letterSpacing: "0.12em", marginBottom: 6 }}>INTENT · Moss 意图（签前证据）</p>
                    <p style={{ fontSize: "0.85rem", lineHeight: 1.6 }}>{prepared.intent.intent}</p>
                    <dl style={{ fontSize: "0.75rem", color: "#b8ae99", lineHeight: 1.9, marginTop: 6 }}>
                      <div>verb: <code style={{ color: "#e0a253" }}>{prepared.intent.verb}</code> · category: <code style={{ color: "#e0a253" }}>{prepared.intent.category}</code></div>
                      <div>risk: {prepared.intent.risk.map((r, i) => <span key={i}><code style={{ color: "#c0392b" }}>[{r}]</code> </span>)}</div>
                      <div>tags: {prepared.intent.tags.map((t, i) => <span key={i}><code style={{ color: "#948b78" }}>{t}</code> </span>)}</div>
                    </dl>
                  </div>
                )}

                {/* Capability 参数 */}
                <div style={{ marginTop: 10, fontSize: "0.75rem" }}>
                  <p style={{ color: "#7d7462", letterSpacing: "0.12em", fontSize: "0.7rem", marginBottom: 4 }}>CAPABILITY PARAMS · 实际发给 Moss 的参数</p>
                  <pre style={{ color: "#b8ae99", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, lineHeight: 1.7 }}>
{JSON.stringify(prepared.capabilityParams, null, 2)}
                  </pre>
                </div>

                {/* 未签名交易 */}
                <div style={{ marginTop: 10, fontSize: "0.75rem" }}>
                  <p style={{ color: "#7d7462", letterSpacing: "0.12em", fontSize: "0.7rem", marginBottom: 4 }}>UNSIGNED TX · 钱包将签署的原始交易</p>
                  <pre style={{ color: "#b8ae99", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, lineHeight: 1.7 }}>
{JSON.stringify(prepared.unsignedTransaction, null, 2)}
                  </pre>
                  <p style={{ color: "#b8ae99", marginTop: 4 }}>estimatedGas: {prepared.estimatedGas} · RPC: {prepared.rpcFingerprint}</p>
                </div>

                {/* 模拟 Receipt */}
                <div style={{ marginTop: 10, fontSize: "0.75rem" }}>
                  <p style={{ color: "#7d7462", letterSpacing: "0.12em", fontSize: "0.7rem", marginBottom: 4 }}>SIMULATION RECEIPT · 模拟执行结果</p>
                  <pre style={{ color: "#b8ae99", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, lineHeight: 1.7, maxHeight: 220, overflow: "auto" }}>
{JSON.stringify(prepared.receipt, null, 2)}
                  </pre>
                </div>

                {prepared.warnings.length > 0 && (
                  <ul style={{ color: "#e0a253", fontSize: "0.75rem", marginTop: 8 }}>
                    {prepared.warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                )}

                {/* 第 4 层：溯源与哈希（事后可验证） */}
                {prepared.e3 && (
                  <div style={{ marginTop: 10, fontSize: "0.75rem", borderTop: "1px solid rgba(214,205,185,0.15)", paddingTop: 10 }}>
                    <p style={{ color: "#7d7462", letterSpacing: "0.12em", fontSize: "0.7rem", marginBottom: 6 }}>E3 溯源与哈希 · PROVENANCE</p>
                    <pre style={{ color: "#b8ae99", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, lineHeight: 1.8 }}>{`canonicalPayloadHash: ${prepared.e3.canonicalPayloadHash}
mossCommit:           ${prepared.e3.mossCommit}
protocolVersion:     ${prepared.e3.protocolVersion}
contract:            ${prepared.e3.contractAddress}
abiHash:             ${prepared.e3.abiHash}
chainId:             ${prepared.e3.chainId}`}</pre>
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <button onClick={signAndCreate} disabled={isSending} type="button" style={btn}>
                    {isSending ? "等待钱包签名…" : "② 签名并广播（钱包）"}
                  </button>
                </div>
              </div>
            )}
            {txHash && <p style={{ fontSize: "0.75rem", color: "#77c98b", wordBreak: "break-all" }}>✓ tx: {txHash}</p>}
          </section>

          {/* 阶段 2：载入 taskId（交易确认后从事件取，演示先手填） */}
          <section style={card}>
            <h2>② 任务 ID</h2>
            <p style={{ color: "#b8ae99", fontSize: "0.85rem" }}>
              广播确认后从 TaskCreated 事件拿到 taskId（或粘贴链上已有任务）。
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={taskId ?? ""}
                onChange={(e) => setTaskId(e.target.value.startsWith("0x") ? e.target.value as `0x${string}` : undefined)}
                placeholder="taskId 0x…"
                style={{ ...input, width: 380 }}
              />
              <button onClick={() => { setTaskId((taskId ?? "0x") as `0x${string}`); }} type="button" style={btn} disabled={!taskId}>
                载入
              </button>
            </div>
            {txHash && step !== "idle" && (
              <p style={{ fontSize: "0.75rem", color: "#77c98b", marginTop: 8 }}>
                ✓ 已读取链上状态：{STATUS_LABELS[status ?? 0]}
              </p>
            )}
          </section>

          {/* 阶段 3：生命周期操作 */}
          {taskId && (
            <section style={card}>
              <h2>③ 生命周期 <span style={{ color: "#7d7462", fontSize: "0.7rem" }}>DIRECT PATH</span></h2>
              <p style={{ fontSize: "0.8rem" }}>状态：<b style={{ color: "#e0a253" }}>{STATUS_LABELS[status ?? 0]}</b>
                {" "}<Link href={`/courtroom?taskId=${taskId}`} style={{ color: "#d6cdb9", fontSize: "0.75rem" }}>在法庭页查看 →</Link>
              </p>
              {details && (
                <dl style={{ fontSize: "0.75rem", color: "#b8ae99", lineHeight: 1.8 }}>
                  <div>委托人 {details.client.slice(0, 8)}… · 承接 Agent {details.agent === ZERO_ADDR ? "（未指派）" : details.agent.slice(0, 8) + "…"}</div>
                  <div>托管 {details.amount} MON · 截止 {details.deadline}</div>
                  <div>deliveryHash {details.deliveryHash === "0x" + "0".repeat(64) ? "（未提交）" : details.deliveryHash.slice(0, 16) + "…"}</div>
                </dl>
              )}
              {actionError && <p style={{ color: "#c0392b", fontSize: "0.8rem" }}>✗ {actionError}</p>}

              {step === "created" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <input
                    value={agentAddress}
                    onChange={(e) => setAgentAddress(e.target.value)}
                    placeholder="Agent 地址 0x…"
                    style={{ ...input, width: 280 }}
                  />
                  <button onClick={doAssign} type="button" style={btn}>指派 Agent</button>
                  <button onClick={doSubmit} type="button" style={btn}>提交交付</button>
                </div>
              )}
              {step === "delivered" && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={doAccept} type="button" style={btn}>验收（全款给 Agent）</button>
                  <button onClick={doDispute} type="button" style={btn}>发起争议</button>
                </div>
              )}
              {step === "disputed" && (
                <p style={{ fontSize: "0.8rem", color: "#e0a253" }}>争议已开启 → 规则引擎提出结算方案（settle 需 settlementAuthority 钱包，本页暂未接）</p>
              )}
              {(step === "accepted" || step === "settled" || step === "refunded") && (
                <p style={{ fontSize: "0.8rem", color: "#77c98b" }}>任务已进入终态：{STATUS_LABELS[status ?? 0]}</p>
              )}
            </section>
          )}
        </>
      )}

      <footer style={{ marginTop: 32, fontSize: "0.7rem", color: "#7d7462" }}>
        Moss 只负责 createTask 的模拟与 E3；后续写操作走 direct viem 路径，不标 Moss verified。钱包是唯一签名与广播边界。
      </footer>
    </main>
  );
}

const btn: React.CSSProperties = {
  background: "rgba(192,57,43,0.15)",
  border: "1px solid #c0392b",
  color: "#f4efe4",
  padding: "0.5rem 1rem",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: "0.8rem",
  fontFamily: "inherit",
};

const input: React.CSSProperties = {
  background: "rgba(11,9,6,0.8)",
  border: "1px solid rgba(214,205,185,0.3)",
  color: "#f4efe4",
  padding: "0.5rem 0.6rem",
  borderRadius: 4,
  fontSize: "0.75rem",
  fontFamily: "inherit",
};

const card: React.CSSProperties = {
  border: "1px solid rgba(214,205,185,0.15)",
  borderRadius: 8,
  padding: "1.2rem 1.4rem",
  marginBottom: 16,
  background: "rgba(11,9,6,0.6)",
};
