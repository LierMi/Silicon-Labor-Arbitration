"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ACTOR_ROLE_LABEL,
  AI_ROLE_LABEL,
  CASE_STATUS_LABEL,
  CASE_STATUSES,
  CASE_TRANSITIONS,
  freshPotatoCase,
  findEvidence,
  findRuleResult,
  hasUndecidable,
  undecidableIds,
} from "@sla/domain";
import type { AiArgument, Case, Evidence, Requirement, RuleResult } from "@sla/domain";

const caseData = freshPotatoCase();

const scenes = [
  { id: "intake", label: "责任碎片" },
  { id: "case-file", label: "案件开卷" },
  { id: "chain", label: "责任断层" },
  { id: "rules", label: "规则盖章" },
  { id: "arguments", label: "交叉质询" },
  { id: "report", label: "归档报告" },
];

const sourceLabel: Record<Evidence["source"], string> = {
  moss: "Moss 签前证据",
  direct: "Direct 交易证据",
  offchain: "链下证据",
};

const sourceShort: Record<Evidence["source"], string> = {
  moss: "MOSS",
  direct: "DIRECT",
  offchain: "OFFCHAIN",
};

const fragmentLayouts = [
  { x: "9%", y: "18%", rotate: -5, depth: 18, wide: true },
  { x: "63%", y: "15%", rotate: 6, depth: -14, wide: false },
  { x: "51%", y: "63%", rotate: -2, depth: 10, wide: true },
  { x: "14%", y: "64%", rotate: 7, depth: -9, wide: false },
  { x: "73%", y: "52%", rotate: -8, depth: 12, wide: false },
] as const;

const fragmentCopy: Record<string, { title: string; note: string }> = {
  E1: { title: "E1 原始需求", note: "原始需求、验收条件、权重承诺" },
  E2: { title: "E2 交付物", note: "potato.png / PNG / alpha" },
  E3: { title: "E3 Moss", note: "签前解释、模拟结果、unsigned tx" },
};

function shortHash(value?: string) {
  if (!value || value === "PENDING") return "PENDING";
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function ArchiveScene({
  id,
  index,
  kicker,
  title,
  children,
  action,
  className = "",
  onEnter,
}: {
  id: string;
  index: number;
  kicker: string;
  title: ReactNode;
  children: ReactNode;
  action?: { href: string; label: string; delayed?: boolean };
  className?: string;
  onEnter: (id: string) => void;
}) {
  return (
    <section id={id} className={`archive-scene ${className}`} onMouseEnter={() => onEnter(id)}>
      <div className="scene-rubric">
        <span>{String(index).padStart(2, "0")}</span>
        <p>{kicker}</p>
      </div>
      <div className="scene-heading">
        <h2>{title}</h2>
        {action ? <a className={`archive-action ${action.delayed ? "is-delayed" : ""}`} href={action.href}>{action.label}</a> : null}
      </div>
      {children}
    </section>
  );
}

function DossierPager({ activeScene, onSelect }: { activeScene: string; onSelect: (id: string) => void }) {
  return (
    <nav className="dossier-pager" aria-label="卷宗分镜导航">
      {scenes.map((scene, index) => (
        <a
          className={activeScene === scene.id ? "is-active" : ""}
          href={`#${scene.id}`}
          key={scene.id}
          onClick={() => onSelect(scene.id)}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          <b>{scene.label}</b>
        </a>
      ))}
    </nav>
  );
}

function ProvenanceBadge({ source }: { source: Evidence["source"] }) {
  return <span className={`source-badge source-${source}`}>{sourceShort[source]}</span>;
}

function EvidenceFragment({
  evidence,
  title,
  note,
  x,
  y,
  rotate,
  depth,
  mouse,
  onSelect,
  wide = false,
}: {
  evidence: Evidence;
  title: string;
  note: string;
  x: string;
  y: string;
  rotate: number;
  depth: number;
  mouse: { x: number; y: number };
  onSelect: (id: string) => void;
  wide?: boolean;
}) {
  const transform = `translate3d(${mouse.x * depth}px, ${mouse.y * depth}px, 0) rotate(${rotate}deg)`;
  return (
    <button
      className={`evidence-fragment ${wide ? "is-wide" : ""} source-card-${evidence.source}`}
      onClick={() => onSelect(evidence.id)}
      style={{ left: x, top: y, transform }}
      type="button"
    >
      <span className="fragment-pin">{evidence.id}</span>
      <ProvenanceBadge source={evidence.source} />
      <strong>{title}</strong>
      <small>{note}</small>
    </button>
  );
}

function EvidenceDrawer({
  evidence,
  onClose,
}: {
  evidence?: Evidence;
  onClose: () => void;
}) {
  return (
    <aside className={`evidence-drawer ${evidence ? "is-open" : ""}`} aria-live="polite">
      {evidence ? (
        <>
          <button className="drawer-close" onClick={onClose} type="button">关闭</button>
          <p className="eyebrow">{sourceLabel[evidence.source]}</p>
          <h3>{evidence.id} / {evidence.label}</h3>
          <p>{evidence.text ?? evidence.mossPreSign?.explanation ?? "结构化证据，无正文。"}</p>
          <dl>
            <div>
              <dt>来源</dt>
              <dd>{sourceLabel[evidence.source]}</dd>
            </div>
            <div>
              <dt>时间</dt>
              <dd>{formatTime(evidence.ts)}</dd>
            </div>
            <div>
              <dt>Hash</dt>
              <dd>{shortHash(evidence.hash ?? evidence.mossPreSign?.canonicalPayloadHash)}</dd>
            </div>
          </dl>
        </>
      ) : null}
    </aside>
  );
}

function StatusLedger({ c }: { c: Case }) {
  const next = CASE_TRANSITIONS[c.status];
  return (
    <div className="status-ledger">
      <p className="eyebrow">Case state machine</p>
      <div className="status-track">
        {CASE_STATUSES.map((status) => (
          <span className={status === c.status ? "is-current" : ""} key={status}>
            {CASE_STATUS_LABEL[status]}
          </span>
        ))}
      </div>
      <p className="ledger-note">
        当前状态：<b>{CASE_STATUS_LABEL[c.status]}</b>。
        下一步：{next.length ? next.map((status) => CASE_STATUS_LABEL[status]).join(" / ") : "终态"}。
      </p>
    </div>
  );
}

function CaseFileSheet({ c, onEvidence }: { c: Case; onEvidence: (id: string) => void }) {
  const e1 = findEvidence(c, "E1");
  const e3 = findEvidence(c, "E3");
  const moss = e3?.mossPreSign;

  return (
    <div className="case-sheet">
      <div className="case-stamp">待复核</div>
      <div>
        <p className="eyebrow">Case file / mock dossier</p>
        <h3>{c.title}</h3>
        <p>{c.caseNo} · {CASE_STATUS_LABEL[c.status]} · Monad Testnet {c.onchain.chainId}</p>
      </div>
      <div className="case-tags">
        <span>{c.isMock ? "Mock data / Demo" : "Live evidence"}</span>
        <span>{c.onchain.amount} MON escrow</span>
        <span>{hasUndecidable(c) ? `${undecidableIds(c).join(", ")} 待人工复核` : "全部可判定"}</span>
      </div>
      <div className="evidence-pin-grid">
        {e1 ? (
          <button className="pinned-evidence" onClick={() => onEvidence(e1.id)} type="button">
            <ProvenanceBadge source={e1.source} />
            <strong>{e1.id} 原始需求</strong>
            <span>{e1.text}</span>
          </button>
        ) : null}
        {e3 ? (
          <button className="pinned-evidence moss-evidence" onClick={() => onEvidence(e3.id)} type="button">
            <ProvenanceBadge source={e3.source} />
            <strong>{e3.id} Moss 签前证据</strong>
            <span>{moss?.explanation}</span>
            <code>ABI {shortHash(moss?.abiHash)}</code>
          </button>
        ) : null}
      </div>
      <div className="wallet-gate">
        <span>Unsigned tx fingerprint</span>
        <b>{shortHash(moss?.canonicalPayloadHash)}</b>
        <small>钱包一致性校验预留：签名前后逐字段比对，不由 Moss 代签。</small>
      </div>
    </div>
  );
}

function ResponsibilityChain({
  c,
  activeHop,
  setActiveHop,
  onEvidence,
}: {
  c: Case;
  activeHop: string;
  setActiveHop: (id: string) => void;
  onEvidence: (id: string) => void;
}) {
  const layers = c.responsibilityChain;
  const delivery = findEvidence(c, "E2");

  return (
    <div className="chain-composition">
      <div className="layer-stack" aria-label="责任断层">
        {layers.map((hop, index) => (
          <button
            className={`layer-slice ${activeHop === hop.id ? "is-active" : ""}`}
            key={hop.id}
            onClick={() => setActiveHop(hop.id)}
            onMouseEnter={() => setActiveHop(hop.id)}
            style={{ "--i": index } as CSSProperties}
            type="button"
          >
            <span>{hop.id}</span>
            <strong>{hop.actor}</strong>
            <small>{hop.evidenceRefs.join(" / ")}</small>
          </button>
        ))}
        <button
          className="layer-slice delivery-layer"
          onClick={() => delivery && onEvidence(delivery.id)}
          style={{ "--i": layers.length } as CSSProperties}
          type="button"
        >
          <span>E2</span>
          <strong>Delivery</strong>
          <small>potato.png</small>
        </button>
      </div>
      <div className="chain-timeline">
        {layers.map((hop) => (
          <article
            className={activeHop === hop.id ? "is-active" : ""}
            key={hop.id}
            onMouseEnter={() => setActiveHop(hop.id)}
          >
            <time>{formatTime(hop.ts)}</time>
            <div>
              <h3>{hop.actor}</h3>
              <p className="role">{ACTOR_ROLE_LABEL[hop.actorRole]}</p>
              <p><b>授权</b>{hop.authority}</p>
              <p><b>警告</b>{hop.sawWarning ?? "无记录"}</p>
              <p><b>动作</b>{hop.action}</p>
              {hop.intentDrift ? <p className="drift">{hop.intentDrift}</p> : null}
              <div className="cite-row">
                {hop.evidenceRefs.map((ref) => (
                  <button key={ref} onClick={() => onEvidence(ref)} type="button">[{ref}]</button>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function RuleRow({
  requirement,
  result,
  onEvidence,
  index,
}: {
  requirement: Requirement;
  result?: RuleResult;
  onEvidence: (id: string) => void;
  index: number;
}) {
  const verdict = result?.verdict ?? "undecidable";
  const isUndecidable = verdict === "undecidable";
  const stampLabel = verdict === "satisfied" ? "满足" : verdict === "violated" ? "驳回" : "待复核";

  return (
    <article className={`rule-sheet-row verdict-${verdict}`} style={{ "--delay": `${index * 0.34}s` } as CSSProperties}>
      <div className="clause-number">{requirement.id}</div>
      <div className="clause-copy">
        <h3>{requirement.label}</h3>
        <p>
          {requirement.type === "objective" ? "客观条款，确定性规则层可复算。" : "主观条款，确定性规则层无法判定。"}
          <span>{requirement.weightBps / 100}% 权重</span>
        </p>
        {result?.reason ? <small>{result.reason}</small> : null}
        {result?.basis.length ? (
          <div className="cite-row">
            {result.basis.map((basis) => (
              <button key={basis} onClick={() => onEvidence(basis)} type="button">[{basis}]</button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="stamp-bay">
        {isUndecidable ? (
          <>
            <div className="empty-stamp-slot" />
            <div className="suspended-stamp"><span>{stampLabel}</span></div>
            <p>C4 空章位 · 资金冻结</p>
          </>
        ) : (
          <div className="printed-stamp"><span>{stampLabel}</span></div>
        )}
      </div>
    </article>
  );
}

function SettlementBook({ c }: { c: Case }) {
  const settlement = c.settlementProposal;

  return (
    <aside className="settlement-book">
      <p className="eyebrow">Settlement ledger</p>
      <h3>资金账本</h3>
      <dl>
        <div>
          <dt>支付给 Agent</dt>
          <dd>{settlement?.toAgent ?? "0"} MON</dd>
        </div>
        <div>
          <dt>退回委托人</dt>
          <dd>{settlement?.toClient ?? "0"} MON</dd>
        </div>
        <div className="frozen-line">
          <dt>冻结待人工复核</dt>
          <dd>{settlement?.frozen ?? "0"} MON</dd>
        </div>
      </dl>
      <p>金额来自事前权重与规则结果，AI 意见不决定分账。</p>
      {/*
        C4 是核心条款（不可分给付）。它判不了时**全额冻结**，
        而不是按权重先付 C1–C3 的 75%——三条腿的桌子不值一张桌子的 75%。
        所以这里的冻结金额等于全部托管额，不是 C4 单条的份额。
      */}
      <p className="frozen-note">
        C4 属核心条款，不可裁决时全额冻结：交付物整体不可用时，
        格式合规不产生独立价值。
      </p>
    </aside>
  );
}

function CitationText({
  argument,
  onEvidence,
}: {
  argument: AiArgument;
  onEvidence: (id: string) => void;
}) {
  return (
    <p>
      {argument.text.split(/(\[E\d+\])/g).map((part, index) => {
        const match = part.match(/\[(E\d+)\]/);
        if (!match) return <span key={`${part}-${index}`}>{part}</span>;
        return (
          <button className="inline-cite" key={`${part}-${index}`} onClick={() => onEvidence(match[1])} type="button">
            {part}
          </button>
        );
      })}
    </p>
  );
}

function ArgumentsScene({ c, onEvidence }: { c: Case; onEvidence: (id: string) => void }) {
  return (
    <div className="argument-desk">
      {c.aiArguments.map((argument) => (
        <article className="argument-paper" key={argument.role}>
          <p className="eyebrow">{AI_ROLE_LABEL[argument.role]}</p>
          <CitationText argument={argument} onEvidence={onEvidence} />
          <div className="argument-footer">
            <span>引用：{argument.cites.map((cite) => `[${cite}]`).join(" ")}</span>
            <span>不确定：{argument.uncertain.join(" / ")}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function DemoPage() {
  const [activeScene, setActiveScene] = useState(scenes[0].id);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [activeHop, setActiveHop] = useState(caseData.responsibilityChain[0]?.id ?? "");
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const activeEvidence = useMemo(
    () => (activeEvidenceId ? findEvidence(caseData, activeEvidenceId) : undefined),
    [activeEvidenceId],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (current?.target.id) setActiveScene(current.target.id);
      },
      { rootMargin: "-28% 0px -45% 0px", threshold: [0.25, 0.5, 0.75] },
    );

    for (const scene of scenes) {
      const element = document.getElementById(scene.id);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, []);

  function updateMouse(event: React.PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMouse({
      x: (event.clientX - rect.left) / rect.width - 0.5,
      y: (event.clientY - rect.top) / rect.height - 0.5,
    });
  }

  return (
    <main className="archive-page">
      <DossierPager activeScene={activeScene} onSelect={setActiveScene} />
      <EvidenceDrawer evidence={activeEvidence} onClose={() => setActiveEvidenceId(null)} />

      <ArchiveScene
        action={{ href: "#case-file", label: "打开卷宗" }}
        className="fragment-scene"
        id="intake"
        index={1}
        kicker="Responsibility fragments"
        onEnter={setActiveScene}
        title={<><span>证据都在，</span><span>责任中心缺席</span></>}
      >
        <div className="fragment-field" onPointerMove={updateMouse} onPointerLeave={() => setMouse({ x: 0, y: 0 })}>
          <div className="missing-center">
            <span>UNASSIGNED</span>
            <b>责任落点缺席</b>
          </div>
          {caseData.evidence.map((evidence, index) => {
            const layout = fragmentLayouts[index % fragmentLayouts.length];
            const copy = fragmentCopy[evidence.id] ?? {
              title: `${evidence.id} ${evidence.label}`,
              note: evidence.kind.replaceAll("_", " / "),
            };
            return (
              <EvidenceFragment
                depth={layout.depth}
                evidence={evidence}
                key={evidence.id}
                mouse={mouse}
                note={copy.note}
                onSelect={setActiveEvidenceId}
                rotate={layout.rotate}
                title={copy.title}
                wide={layout.wide}
                x={layout.x}
                y={layout.y}
              />
            );
          })}
          <div className="paper-shard shard-a" style={{ transform: `translate(${mouse.x * -10}px, ${mouse.y * 12}px) rotate(11deg)` }}>
            主 Agent 转译记录
          </div>
          <div className="paper-shard shard-b" style={{ transform: `translate(${mouse.x * 15}px, ${mouse.y * -8}px) rotate(-9deg)` }}>
            wallet signature
          </div>
          <div className="paper-shard shard-c" style={{ transform: `translate(${mouse.x * -18}px, ${mouse.y * -13}px) rotate(4deg)` }}>
            tool params
          </div>
        </div>
      </ArchiveScene>

      <ArchiveScene
        action={{ href: "#chain", label: "核对证据" }}
        className="case-file-scene"
        id="case-file"
        index={2}
        kicker="Case intake"
        onEnter={setActiveScene}
        title="打开卷宗，不打开判决书"
      >
        <CaseFileSheet c={caseData} onEvidence={setActiveEvidenceId} />
        <StatusLedger c={caseData} />
      </ArchiveScene>

      <ArchiveScene
        action={{ href: "#rules", label: "进入规则判定" }}
        className="chain-scene"
        id="chain"
        index={3}
        kicker="Evidence-backed chain"
        onEnter={setActiveScene}
        title="责任在转译中变薄"
      >
        <ResponsibilityChain
          activeHop={activeHop}
          c={caseData}
          onEvidence={setActiveEvidenceId}
          setActiveHop={setActiveHop}
        />
      </ArchiveScene>

      <ArchiveScene
        action={{ href: "#arguments", label: "提交人工复核", delayed: true }}
        className="rules-scene"
        id="rules"
        index={4}
        kicker="Objective rules only"
        onEnter={setActiveScene}
        title="C1-C3 可以落章，C4 必须停住"
      >
        <div className="rules-layout">
          <div className="rule-sheet">
            <div className="rule-sheet-head">
              <span>规则判定</span>
              <small>每条验收条件权重 25%</small>
            </div>
            {caseData.requirements.map((requirement, index) => (
              <RuleRow
                index={index}
                key={requirement.id}
                onEvidence={setActiveEvidenceId}
                requirement={requirement}
                result={findRuleResult(caseData, requirement.id)}
              />
            ))}
          </div>
          <SettlementBook c={caseData} />
        </div>
      </ArchiveScene>

      <ArchiveScene
        action={{ href: "#report", label: "查看归档报告" }}
        className="arguments-scene"
        id="arguments"
        index={5}
        kicker="Three-sided arguments"
        onEnter={setActiveScene}
        title="AI 只解释，并且必须引用证据"
      >
        <ArgumentsScene c={caseData} onEvidence={setActiveEvidenceId} />
      </ArchiveScene>

      <ArchiveScene
        className="report-scene"
        id="report"
        index={6}
        kicker="Manual review pending"
        onEnter={setActiveScene}
        title="归档完成，终审仍在人手里"
      >
        <div className="report-folder">
          <div>
            <p className="eyebrow">Archive report</p>
            <h3>{caseData.caseNo}</h3>
            <p>
              C1-C3 已由确定性规则层复算，C4 保持 {findRuleResult(caseData, "C4")?.verdict}。
              C4 属核心条款，不可裁决时全额冻结，等待人工复核，不输出终局裁决。
            </p>
          </div>
          <div className="report-grid">
            <span>证据 {caseData.evidence.length} 份</span>
            <span>责任链 {caseData.responsibilityChain.length} hops</span>
            <span>冻结 {caseData.settlementProposal?.frozen} MON</span>
            <span>{CASE_STATUS_LABEL.ManualReview} 入口已保留</span>
          </div>
          <button className="archive-action static-action" type="button">查看归档报告</button>
        </div>
      </ArchiveScene>
    </main>
  );
}
