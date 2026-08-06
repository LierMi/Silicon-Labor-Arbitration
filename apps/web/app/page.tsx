"use client";

/**
 * 硅基劳动仲裁院 · 主体验
 *
 * 结构：开屏页 → 进入案件。**不是竖向滚动的 PPT。**
 *
 * 六幕之间用键盘 / 点击 / 幕次轨切换，每幕独占一屏，交叉淡入。
 * 之所以不做滚动：滚动是「浏览文档」的手势，而我们要的是
 * 「一幕一幕看下去」的剧场节奏（docs/03 §十二：顿比动重要）。
 *
 * 文案原则：
 * 评委只有三分钟，看不懂「责任碎片」这种内部黑话。
 * 每一幕的标题必须是**人话**，说清这一步发生了什么、为什么重要。
 * 抽象的留给副标题。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  ACTOR_ROLE_LABEL,
  AI_ROLE_LABEL,
  CASE_STATUS_LABEL,
  freshPotatoCase,
  findEvidence,
  findRuleResult,
} from "@sla/domain";
import type { AiArgument, Case, Evidence, Requirement, RuleResult } from "@sla/domain";

const c: Case = freshPotatoCase();

/* ══════════════════════════════════════════════════════════
   程序性的不完美（docs/03 §十一③）
   完美的重复是软件，微小的不完美是手工。

   用 seed 派生而非 Math.random()：服务端预渲染和客户端 hydration
   必须得到同一个值，真随机会让 React 报 hydration 错误。
   ══════════════════════════════════════════════════════════ */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (n: number) => (((h >>> (n * 5)) & 255) / 255) * 2 - 1;
}

/** 条款 label 里可能嵌着原始 ISO 串，直接显示会露出 2026-08-05T16:10:29Z */
function humanLabel(label: string) {
  return label.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, (iso) =>
    new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Shanghai",
    }).format(new Date(iso)),
  );
}

function stampMark(seed: string) {
  const r = seeded(seed);
  return {
    "--rot": `${-4 + r(0) * 3.4}deg`,
    "--dx": `${r(1) * 2.6}px`,
    "--dy": `${r(2) * 2.6}px`,
    "--ink": `${0.82 + r(3) * 0.1}`,
  } as CSSProperties;
}

/* ══════════════════════════════════════════════════════════
   幕次定义 —— 标题必须是人话
   ══════════════════════════════════════════════════════════ */

const ACTS = [
  { id: "commission", no: "01", en: "Commission", zh: "委托", title: "0.2 MON 被锁进合约" },
  { id: "delivery", no: "02", en: "Delivery", zh: "交付", title: "他收到了一颗土豆" },
  { id: "chain", no: "03", en: "Chain of custody", zh: "断链", title: "五个环节，没有一个人负责" },
  { id: "ruling", no: "04", en: "Ruling", zh: "判定", title: "三个章落下，第四个落不下去" },
  { id: "arguments", no: "05", en: "Cross-examination", zh: "质询", title: "三方意见，每句都得引用证据" },
  { id: "archive", no: "06", en: "Archive", zh: "归档", title: "钱冻住，终审留给人" },
] as const;

/* ══════════════════════════════════════════════════════════
   开屏页
   ══════════════════════════════════════════════════════════ */

const EXHIBIT_TITLE: Record<string, string> = {
  E1: "原始需求",
  E2: "交付物",
  E3: "签名前的解释",
};

const EXHIBIT_NOTE: Record<string, string> = {
  E1: "一只适合儿童产品的橙色猫\n透明背景 · PNG · 12:00 前",
  E2: "potato.png\nPNG · 含 alpha · 11:42 送达",
  E3: "Moss 说：资金将锁入托管\n验收通过前不会释放",
};

/** 悬挂的证物板。位置、角度、悬线长度都在这里，方便整体调布局 */
const HANGING = [
  { id: "E1", x: 40, y: 24, w: 14, wire: 24, tilt: -3.2, depth: 1 },
  { id: "E2", x: 66, y: 17, w: 14, wire: 17, tilt: 2.6, depth: 1.4 },
  { id: "E3", x: 60, y: 60, w: 14.5, wire: 60, tilt: -2, depth: 0.7 },
] as const;

interface Tag {
  text: string;
  x: number;
  y: number;
  tilt: number;
  depth: number;
  warn?: boolean;
}

const TAGS: Tag[] = [
  { text: "agent translation log", x: 36, y: 72, tilt: -7, depth: 1.8 },
  { text: "tool params", x: 84, y: 34, tilt: 5, depth: 2.2 },
  { text: "wallet signature", x: 80, y: 66, tilt: -6, depth: 1.5 },
  { text: "chain of custody\nBROKEN HERE", x: 47, y: 84, tilt: 3, depth: 2.6, warn: true },
];

function Landing({ onEnter }: { onEnter: () => void }) {
  const [m, setM] = useState({ x: 0, y: 0 });
  const [leaving, setLeaving] = useState(false);

  const move = useCallback((e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setM({
      x: (e.clientX - r.left) / r.width - 0.5,
      y: (e.clientY - r.top) / r.height - 0.5,
    });
  }, []);

  const enter = () => {
    setLeaving(true);
    window.setTimeout(onEnter, 620);
  };

  return (
    <div
      className={`landing ${leaving ? "is-leaving" : ""}`}
      onPointerMove={move}
      onPointerLeave={() => setM({ x: 0, y: 0 })}
    >
      <header className="top-bar">
        <div className="brand">
          <span className="brand-mark">仲</span>
          <b>硅基劳动仲裁院</b>
          <i>SILICON LABOR ARBITRATION</i>
        </div>
        <span className="case-no">案卷 {c.caseNo}</span>
        <button className="enter-link" onClick={enter} type="button">
          进入案件 <em>→</em>
        </button>
      </header>

      {/* ── 暗房：吊灯 + 悬挂的证物 + 中心的空 ── */}
      <div className="stage" style={{ "--mx": m.x, "--my": m.y } as CSSProperties}>
        <div className="beam" />
        <div className="bulb-wire" />
        <div className="bulb">
          <span className="bulb-glow" />
        </div>

        {HANGING.map((h) => {
          const ev = findEvidence(c, h.id);
          if (!ev) return null;
          return (
            <div
              key={h.id}
              className="hang"
              style={
                {
                  left: `${h.x}%`,
                  top: `${h.y}%`,
                  "--w": `${h.w}rem`,
                  "--wire": `${h.wire}vh`,
                  "--tilt": `${h.tilt}deg`,
                  "--d": h.depth,
                } as CSSProperties
              }
            >
              <span className="hang-wire" />
              <article className="exhibit-panel">
                <b>{ev.id}</b>
                <strong>{EXHIBIT_TITLE[ev.id] ?? ev.label}</strong>
                <p>{EXHIBIT_NOTE[ev.id]}</p>
              </article>
            </div>
          );
        })}

        {TAGS.map((t) => (
          <span
            key={t.text}
            className={`hang-tag ${t.warn ? "is-warn" : ""}`}
            style={
              {
                left: `${t.x}%`,
                top: `${t.y}%`,
                "--tilt": `${t.tilt}deg`,
                "--d": t.depth,
              } as CSSProperties
            }
          >
            {t.text}
          </span>
        ))}

        {/* 碎屑：爆炸后悬停在空中的东西 */}
        {Array.from({ length: 54 }, (_, i) => {
          const r = seeded(`debris-${i}`);
          return (
            <span
              key={i}
              className="debris"
              style={
                {
                  left: `${62 + r(0) * 34}%`,
                  top: `${50 + r(1) * 44}%`,
                  "--s": `${3 + Math.abs(r(2)) * 13}px`,
                  "--tilt": `${r(3) * 180}deg`,
                  "--d": 1 + Math.abs(r(0)) * 2.4,
                  "--delay": `${Math.abs(r(1)) * 6}s`,
                } as CSSProperties
              }
            />
          );
        })}

        {/* 中心：什么都没有的地方。这才是主角 */}
        <div className="void">
          <span className="void-ring" />
          <div className="void-copy">
            <span>责任落点</span>
            <b>无人认领</b>
          </div>
        </div>

        <div className="floor" />
      </div>

      {/* ── 左侧：说人话的部分 ── */}
      <div className="pitch">
        <h1>
          你把事情交给了 AI。
          <br />
          <em>责任交给了谁？</em>
        </h1>
        <p className="pitch-lead">
          人说「我没让它这么做」，主 Agent 说「我按意图推理」，工具说「我只执行参数」，
          钱包说「签名合法」。<b>每个环节都有理由，最后没有人负责。</b>
        </p>
        <p className="pitch-stance">
          我们不出判决 —— 只把责任链还原出来，把判不了的钱冻住，终审留给人。
        </p>
        <button className="cta" onClick={enter} type="button">
          查看案件 {c.caseNo}
          <em>→</em>
        </button>
      </div>

      <footer className="bottom-bar">
        <span>Monad Testnet · chain {c.onchain.chainId}</span>
        <span className="dim">托管合约 {c.onchain.taskEscrowAddress?.slice(0, 10)}…</span>
        <span className="dim">证据 3 份 · 责任链 {c.responsibilityChain.length} 跳</span>
      </footer>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   幕 01 委托
   ══════════════════════════════════════════════════════════ */

function ActCommission({ onEvidence }: { onEvidence: (id: string) => void }) {
  const e3 = findEvidence(c, "E3");
  const moss = e3?.mossPreSign;
  return (
    <div className="act-grid">
      <div className="panel">
        <p className="label">签名前，Moss 告诉委托人的原话</p>
        <blockquote>{moss?.explanation}</blockquote>
        <p className="aside">
          这句话被原样存成案件的第一份证据。
          <b>当事情没按这句话发生时，它就是证据。</b>
        </p>
        <button className="cite" onClick={() => onEvidence("E3")} type="button">
          E3 全文
        </button>
      </div>

      <div className="panel">
        <p className="label">这次委托的四条验收标准</p>
        <ol className="terms">
          {c.requirements.map((r) => (
            <li key={r.id}>
              <b>{r.id}</b>
              <span>{humanLabel(r.label)}</span>
              <i>{r.weightBps / 100}%</i>
            </li>
          ))}
        </ol>
        <p className="aside">
          四条标准和各自的权重，在<b>付款之前</b>就被哈希写上了链。事后改一个字，哈希就对不上。
        </p>
        <code className="hashline">{c.onchain.requirementsHash?.slice(0, 24)}…</code>
      </div>

      <div className="panel panel-figure">
        <span className="big-figure">0.2</span>
        <span className="figure-unit">MON</span>
        <p className="aside">
          锁进托管合约。委托人拿不回，Agent 也拿不到 —— 直到验收通过，或者仲裁结算。
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   幕 02 交付
   ══════════════════════════════════════════════════════════ */

function ActDelivery({ onEvidence }: { onEvidence: (id: string) => void }) {
  const e2 = findEvidence(c, "E2");
  const d = e2?.delivery;
  return (
    <div className="act-grid">
      <div className="panel panel-artifact">
        <div className="artifact">
          <span className="artifact-mark">?</span>
          <span className="artifact-name">{d?.fileName}</span>
        </div>
        <button className="cite" onClick={() => onEvidence("E2")} type="button">
          E2 交付记录
        </button>
      </div>

      <div className="panel">
        <p className="label">机器能核对的部分，全部对得上</p>
        <ul className="facts">
          <li>
            <b>格式</b>
            <span>{d?.mimeType}</span>
            <em className="ok">符合</em>
          </li>
          <li>
            <b>透明通道</b>
            <span>{d?.hasAlpha ? "含 alpha" : "无"}</span>
            <em className="ok">符合</em>
          </li>
          <li>
            <b>送达时间</b>
            <span>11:42</span>
            <em className="ok">早于截止</em>
          </li>
          <li className="miss">
            <b>画面主体</b>
            <span>一颗土豆</span>
            <em className="no">机器判不了</em>
          </li>
        </ul>
      </div>

      <div className="panel panel-quote">
        <p className="label">Agent 的附言</p>
        <blockquote className="big-quote">这是对猫这一概念的后现代重构。</blockquote>
        <p className="aside">
          问题不在于它态度好不好，而在于：
          <b>一个 Agent 能否用漂亮的解释，掩盖它没有完成约定的事实？</b>
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   幕 03 断链
   ══════════════════════════════════════════════════════════ */

function ActChain({ onEvidence }: { onEvidence: (id: string) => void }) {
  const [active, setActive] = useState(c.responsibilityChain[0]?.id ?? "");
  const hop = c.responsibilityChain.find((h) => h.id === active);
  return (
    <div className="act-chain">
      <div className="hops">
        {c.responsibilityChain.map((h, i) => (
          <button
            key={h.id}
            className={`hop ${active === h.id ? "is-active" : ""} ${h.intentDrift ? "has-drift" : ""}`}
            style={{ "--i": i } as CSSProperties}
            onMouseEnter={() => setActive(h.id)}
            onClick={() => setActive(h.id)}
            type="button"
          >
            <b>{h.id}</b>
            <strong>{h.actor}</strong>
            <span>{ACTOR_ROLE_LABEL[h.actorRole]}</span>
            {h.intentDrift ? <i>意图偏移</i> : null}
          </button>
        ))}
      </div>

      <div className="panel hop-detail">
        {hop ? (
          <>
            <p className="label">
              {hop.id} · {hop.actor}
            </p>
            <dl>
              <dt>拿到了什么权限</dt>
              <dd>{hop.authority}</dd>
              <dt>做了什么</dt>
              <dd>{hop.action}</dd>
              <dt>看见过警告吗</dt>
              <dd className={hop.sawWarning ? "warn" : ""}>{hop.sawWarning ?? "无记录"}</dd>
            </dl>
            {hop.intentDrift ? <p className="drift">{hop.intentDrift}</p> : null}
            <div className="cite-row">
              {hop.evidenceRefs.map((r) => (
                <button key={r} className="cite" onClick={() => onEvidence(r)} type="button">
                  {r}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <p className="aside chain-aside">
          每一跳都说得通。
          <b>责任不是被谁拿走的，是在传递中一点点变薄的。</b>
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   幕 04 判定 —— 全项目最重要的一屏
   ══════════════════════════════════════════════════════════ */

function ClauseRow({
  r,
  v,
  onEvidence,
}: {
  r: Requirement;
  v?: RuleResult;
  onEvidence: (id: string) => void;
}) {
  const verdict = v?.verdict ?? "undecidable";
  const undecided = verdict === "undecidable";
  return (
    <li className={`clause verdict-${verdict}`}>
      <b className="clause-no">{r.id}</b>
      <div className="clause-body">
        <strong>{humanLabel(r.label)}</strong>
        <span className="clause-meta">
          {r.weightBps / 100}%{r.essential ? " · 核心条款" : ""}
        </span>
        {undecided && v?.reason ? <em>{v.reason}</em> : null}
        {v?.basis.length ? (
          <div className="cite-row">
            {v.basis.map((b) => (
              <button key={b} className="cite" onClick={() => onEvidence(b)} type="button">
                {b}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="stamp-slot">
        {undecided ? (
          <>
            <span className="slot-shadow" />
            <span className="stamp is-hovering">待</span>
            <i>落不下去</i>
          </>
        ) : (
          <span className="stamp is-printed" style={stampMark(r.id)}>
            准
          </span>
        )}
      </div>
    </li>
  );
}

function ActRuling({ onEvidence }: { onEvidence: (id: string) => void }) {
  const s = c.settlementProposal;
  return (
    <div className="act-ruling">
      <ol className="clauses">
        {c.requirements.map((r) => (
          <ClauseRow key={r.id} r={r} v={findRuleResult(c, r.id)} onEvidence={onEvidence} />
        ))}
      </ol>

      <aside className="verdict-side">
        <p className="label">这笔钱怎么分</p>
        <dl className="money">
          <div>
            <dt>付给 Agent</dt>
            <dd>{s?.toAgent} MON</dd>
          </div>
          <div>
            <dt>退回委托人</dt>
            <dd>{s?.toClient} MON</dd>
          </div>
          <div className="frozen">
            <dt>冻结</dt>
            <dd>{s?.frozen} MON</dd>
          </div>
        </dl>
        <p className="aside">
          C1–C3 全部满足，本可以先付 0.15。
          <b>但「是不是一只猫」判不了，而那正是这次委托的核心。</b>
        </p>
        <p className="aside">
          三条腿的桌子不值一张桌子的 75%。交付物整体不可用时，格式合规不产生独立价值 ——
          所以一分钱都不动。
        </p>
      </aside>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   幕 05 质询
   ══════════════════════════════════════════════════════════ */

function Cited({ a, onEvidence }: { a: AiArgument; onEvidence: (id: string) => void }) {
  const parts = a.text.split(/(\[E\d\])/g);
  return (
    <p className="testimony-text">
      {parts.map((p, i) => {
        const m = /^\[(E\d)\]$/.exec(p);
        return m ? (
          <button key={i} className="inline-cite" onClick={() => onEvidence(m[1]!)} type="button">
            {m[1]}
          </button>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </p>
  );
}

function ActArguments({ onEvidence }: { onEvidence: (id: string) => void }) {
  return (
    <div className="act-arguments">
      <div className="testimony-row">
        {c.aiArguments.map((a, i) => (
          <article
            key={a.role}
            className="testimony"
            style={{ "--rot": `${(i - 1) * 1.1}deg`, "--i": i } as CSSProperties}
          >
            <p className="role">{AI_ROLE_LABEL[a.role]}</p>
            <Cited a={a} onEvidence={onEvidence} />
            <footer>不确定：{a.uncertain.join(" / ")}</footer>
          </article>
        ))}
      </div>
      <p className="aside arguments-aside">
        三份意见由 AI 生成，<b>但它们不决定一分钱</b>。金额由事前写死的权重算出，
        AI 只负责解释，而且每一句都必须挂上证据编号。
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   幕 06 归档
   ══════════════════════════════════════════════════════════ */

function ActArchive() {
  return (
    <div className="act-archive">
      <div className="verdict-card">
        <p className="label">Archive report</p>
        <h3>{c.caseNo}</h3>
        <p className="archive-line">
          C1、C2、C3 由确定性规则层复算通过。C4 判不了 —— <b>系统不猜，也不投票。</b>
        </p>
        <div className="archive-stats">
          <span>
            <b>3</b>证据
          </span>
          <span>
            <b>{c.responsibilityChain.length}</b>责任跳数
          </span>
          <span>
            <b>{c.settlementProposal?.frozen}</b>MON 冻结
          </span>
          <span>
            <b>{CASE_STATUS_LABEL.ManualReview}</b>状态
          </span>
        </div>
        <button className="cta cta-final" type="button">
          交由人类终审
          <em>→</em>
        </button>
      </div>
      <p className="closing">我们没有替你做决定。只是把责任找回来，摆在你面前。</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   证据抽屉
   ══════════════════════════════════════════════════════════ */

function Drawer({ ev, onClose }: { ev?: Evidence; onClose: () => void }) {
  return (
    <aside className={`drawer ${ev ? "is-open" : ""}`} aria-live="polite">
      {ev ? (
        <>
          <button className="drawer-close" onClick={onClose} type="button">
            关闭 ✕
          </button>
          <p className="label">
            {ev.source === "moss"
              ? "Moss 签前证据"
              : ev.source === "direct"
                ? "链上交易"
                : "链下证据"}
          </p>
          <h3>
            {ev.id} · {ev.label}
          </h3>
          {ev.text ? <p>{ev.text}</p> : null}
          {ev.mossPreSign ? <p className="quote-in-drawer">{ev.mossPreSign.explanation}</p> : null}
          <dl>
            <dt>时间</dt>
            <dd>{new Date(ev.ts).toLocaleString("zh-CN", { hour12: false })}</dd>
            <dt>哈希</dt>
            <dd>
              <code>{ev.hash ?? ev.mossPreSign?.canonicalPayloadHash}</code>
            </dd>
            {ev.mossPreSign ? (
              <>
                <dt>Moss commit</dt>
                <dd>
                  <code>{ev.mossPreSign.mossCommit.slice(0, 18)}…</code>
                </dd>
                <dt>链上模拟</dt>
                <dd>{ev.mossPreSign.simulation.warnings.length === 0 ? "通过，0 warnings" : "有警告"}</dd>
              </>
            ) : null}
          </dl>
        </>
      ) : null}
    </aside>
  );
}

/* ══════════════════════════════════════════════════════════
   主体
   ══════════════════════════════════════════════════════════ */

export default function Page() {
  const [entered, setEntered] = useState(false);
  const [act, setAct] = useState(0);
  const [evId, setEvId] = useState<string | null>(null);

  const ev = useMemo(() => (evId ? findEvidence(c, evId) : undefined), [evId]);

  const go = useCallback((next: number) => {
    setAct(Math.max(0, Math.min(ACTS.length - 1, next)));
  }, []);

  // 键盘导航 —— 剧场式体验必须能用键盘走完
  useEffect(() => {
    if (!entered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEvId(null);
        return;
      }
      if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(e.key)) {
        e.preventDefault();
        setAct((p) => Math.min(ACTS.length - 1, p + 1));
      }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        setAct((p) => Math.max(0, p - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entered]);

  // 滚轮换幕，但做节流 —— 一次滚动只走一幕，不是连续滑动
  useEffect(() => {
    if (!entered) return;
    let lock = false;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 24 || lock) return;
      lock = true;
      window.setTimeout(() => {
        lock = false;
      }, 900);
      setAct((p) => Math.max(0, Math.min(ACTS.length - 1, p + (e.deltaY > 0 ? 1 : -1))));
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [entered]);

  if (!entered) return <Landing onEnter={() => setEntered(true)} />;

  const current = ACTS[act]!;

  return (
    <div className="theatre">
      <header className="top-bar theatre-bar">
        <button className="brand" onClick={() => setEntered(false)} type="button">
          <span className="brand-mark">仲</span>
          <b>硅基劳动仲裁院</b>
        </button>
        <span className="case-no">
          {c.caseNo} · {CASE_STATUS_LABEL[c.status]}
        </span>
      </header>

      <nav className="act-rail">
        {ACTS.map((a, i) => (
          <button
            key={a.id}
            className={`rail-item ${i === act ? "is-active" : ""} ${i < act ? "is-done" : ""}`}
            onClick={() => go(i)}
            type="button"
          >
            <b>{a.no}</b>
            <span>{a.zh}</span>
          </button>
        ))}
      </nav>

      <main className="stage-area">
        {ACTS.map((a, i) => (
          <section
            key={a.id}
            className={`act ${i === act ? "is-current" : i < act ? "is-past" : "is-future"}`}
            aria-hidden={i !== act}
          >
            <div className="act-head">
              <p className="act-rubric">
                <b>{a.no}</b>
                <i>{a.en}</i>
              </p>
              <h2>{a.title}</h2>
            </div>
            <div className="act-body">
              {a.id === "commission" ? <ActCommission onEvidence={setEvId} /> : null}
              {a.id === "delivery" ? <ActDelivery onEvidence={setEvId} /> : null}
              {a.id === "chain" ? <ActChain onEvidence={setEvId} /> : null}
              {a.id === "ruling" ? <ActRuling onEvidence={setEvId} /> : null}
              {a.id === "arguments" ? <ActArguments onEvidence={setEvId} /> : null}
              {a.id === "archive" ? <ActArchive /> : null}
            </div>
          </section>
        ))}
      </main>

      <footer className="theatre-foot">
        <button className="step" onClick={() => go(act - 1)} disabled={act === 0} type="button">
          ← 上一幕
        </button>
        <span className="step-hint">
          {current.no} / 06 · 方向键或滚动换幕
        </span>
        <button
          className="step"
          onClick={() => go(act + 1)}
          disabled={act === ACTS.length - 1}
          type="button"
        >
          下一幕 →
        </button>
      </footer>

      <Drawer ev={ev} onClose={() => setEvId(null)} />
    </div>
  );
}
