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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";
import {
  ACTOR_ROLE_LABEL,
  CASE_STATUS_LABEL,
  freshPotatoCase,
  findEvidence,
  findRuleResult,
} from "@sla/domain";
import type { AiArgument, Case, Evidence, Requirement, RuleResult } from "@sla/domain";
import {
  buildArgumentPresentation,
  buildArchiveSummary,
  buildEvidenceConnectionIndex,
  buildProofBundle,
  caseRuntimeLabel,
  caseStatusLabel,
  deliveryTimingLabel,
  formatCaseTime,
  monadExplorerUrl,
  parseActHash,
  parseStoredReview,
  reviewStorageKey,
} from "./case-presentation";
import { ResponsibilityChainBoard } from "./responsibility-chain-board";

const c: Case = freshPotatoCase();
const EVIDENCE_CONNECTIONS = buildEvidenceConnectionIndex(c);
const ARCHIVE_SUMMARY = buildArchiveSummary(c);

const ARGUMENT_SHORT_LABEL: Record<AiArgument["role"], string> = {
  prosecution: "检方",
  defense: "辩方",
  audit: "审计",
};

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
  return label.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, (iso) => `${formatCaseTime(iso)}（北京时间）`);
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
  {
    id: "commission",
    no: "01",
    en: "Commission",
    zh: "委托",
    title: "签名合法，不等于结果正当",
    thesis: "合法签名只证明授权发生，不证明 Agent 的理解、执行和最终结果自动获得正当性。",
  },
  {
    id: "delivery",
    no: "02",
    en: "Delivery",
    zh: "交付",
    title: "格式全部合规，任务仍然失败",
    thesis: "机器可以确认时间、格式和透明通道，却无法仅凭参数回答：这颗土豆有没有履行“一只猫”的约定？",
  },
  {
    id: "chain",
    no: "03",
    en: "Chain of custody",
    zh: "归因",
    title: "行动被层层拆分，责任没有自动找到新主人",
    thesis: "主 Agent 转译、工作 Agent 执行、工具生成、钱包签名。每一环都有局部理由，整体责任却在传递中变薄。",
  },
  {
    id: "ruling",
    no: "04",
    en: "Rule boundary",
    zh: "边界",
    title: "规则能执行合约，却不能定义“一只猫”",
    thesis: "确定性规则拥有执行力，但没有解释世界的最终权威。C4 判不了不是系统故障，而是制度边界被诚实地暴露。",
  },
  {
    id: "arguments",
    no: "05",
    en: "Cross-examination",
    zh: "质询",
    title: "AI 可以解释证据，但没有审判人的合法性",
    thesis: "模型分别提出检方、辩方和审计意见，必须引用证据并标记不确定；这些意见不能修改证据，也不能决定一分钱。",
  },
  {
    id: "archive",
    no: "06",
    en: "Unfinished verdict",
    zh: "未决",
    title: "拒绝自动判决，是把申诉权留给人",
    thesis: "仲裁院输出责任时间线，不制造终局真理。系统把可测量的部分算清，把有意义但不可计算的部分交还人类复核，人类保留最终控制权。",
  },
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
  E1: `一只适合儿童产品的橙色猫\n透明背景 · PNG · ${formatCaseTime(c.onchain.deadline ?? "")} 前`,
  E2: `potato.png\nPNG · 含 alpha · ${deliveryTimingLabel(findEvidence(c, "E2")?.delivery?.submittedAt ?? "", c.onchain.deadline ?? "")}`,
  E3: "Moss 说：资金将锁入托管\n验收通过前不会释放",
};

const EVIDENCE_MEDIA: Record<string, { src: string; originalSrc: string; alt: string; badge: string }> = {
  E1: {
    src: "/courtroom/e1-orange-cat-display.png",
    originalSrc: "/courtroom/e1-orange-cat-reference.png",
    alt: "委托人提供的橙色卡通猫视觉参考",
    badge: "原始参考 · PNG / ALPHA",
  },
  E2: {
    src: "/courtroom/e2-potato-display.png",
    originalSrc: "/courtroom/e2-potato.png",
    alt: "Agent 实际交付的透明背景土豆 PNG",
    badge: "原始交付物 · PNG / ALPHA",
  },
};

/** 悬挂的证物板。位置、角度、悬线长度都在这里，方便整体调布局 */
const HANGING = [
  { id: "E1", frame: "glass", x: 40.5, y: 24, w: 14, wire: 24, tilt: -2.8, depth: 1 },
  { id: "E2", frame: "glass", x: 68.5, y: 17.5, w: 13.7, wire: 17.5, tilt: 1.8, depth: 1.4 },
  { id: "E3", frame: "glass", x: 60.5, y: 66.5, w: 13.8, wire: 66.5, tilt: -1.4, depth: 0.7 },
] as const;

interface Tag {
  id: "translation" | "params" | "signature" | "broken";
  text: string;
  kind: "paper" | "acrylic" | "warning";
  x: number;
  y: number;
  tilt: number;
  depth: number;
  warn?: boolean;
}

const TAGS: Tag[] = [
  { id: "translation", text: "agent translation log", kind: "acrylic", x: 35, y: 70, tilt: -7, depth: 1.8 },
  { id: "params", text: "tool params", kind: "acrylic", x: 84, y: 33, tilt: 5, depth: 2.2 },
  { id: "signature", text: "wallet signature", kind: "acrylic", x: 81, y: 65, tilt: -6, depth: 1.5 },
  { id: "broken", text: "chain of custody\nBROKEN HERE", kind: "acrylic", x: 46, y: 83, tilt: 3, depth: 2.6, warn: true },
];

function Landing({ onEnter }: { onEnter: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const depthLayers = gsap.utils.toArray<HTMLElement>("[data-depth]", root);
        const movers = depthLayers.map((layer) => {
          const depth = Number(layer.dataset.depth ?? 1);
          return {
            depth,
            x: gsap.quickTo(layer, "x", { duration: 0.9, ease: "power3.out" }),
            y: gsap.quickTo(layer, "y", { duration: 0.9, ease: "power3.out" }),
          };
        });

        gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .fromTo(".gallery-plate", { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1.02, duration: 1.35 })
          .fromTo(".bulb-bloom", { opacity: 0, scale: 0.45 }, { opacity: 1, scale: 1, duration: 0.7 }, 0.18)
          .fromTo(
            ".hang",
            {
              opacity: 0,
              scale: 0.24,
              x: (_, element) => Number((element as HTMLElement).dataset.burstX ?? 0),
              y: (_, element) => Number((element as HTMLElement).dataset.burstY ?? 0),
              rotationX: (_, element) => Number((element as HTMLElement).dataset.burstY ?? 0) * -0.08,
              rotationY: (_, element) => Number((element as HTMLElement).dataset.burstX ?? 0) * 0.07,
            },
            {
              opacity: 1,
              scale: 1,
              x: 0,
              y: 0,
              rotationX: 0,
              rotationY: 0,
              duration: 1.18,
              stagger: { amount: 0.26, from: "center" },
              ease: "expo.out",
            },
            0.28,
          )
          .fromTo(
            ".hang-tag",
            {
              opacity: 0,
              scale: 0.35,
              x: (_, element) => Number((element as HTMLElement).dataset.burstX ?? 0),
              y: (_, element) => Number((element as HTMLElement).dataset.burstY ?? 0),
            },
            {
              opacity: 1,
              scale: 1,
              x: 0,
              y: 0,
              duration: 0.96,
              stagger: { amount: 0.28, from: "center" },
              ease: "expo.out",
            },
            0.38,
          )
          .fromTo(
            ".debris",
            { opacity: 0, scale: 0.15, x: -28, y: 20 },
            { opacity: 0.72, scale: 1, x: 0, y: 0, duration: 0.9, stagger: { amount: 0.38, from: "center" } },
            0.28,
          )
          .fromTo(".responsibility-void", { opacity: 0, scale: 0.82 }, { opacity: 1, scale: 1, duration: 0.72 }, 0.86)
          .fromTo(".hang:not([data-frame-style='paper']) .panel-glint", { xPercent: -180 }, { xPercent: 280, duration: 0.9, stagger: 0.08, ease: "power2.inOut" }, 0.94)
          .fromTo(
            [".landing-copy", ".landing-chrome"],
            { opacity: 0, y: 18 },
            { opacity: 1, y: 0, duration: 0.72, stagger: 0.08 },
            0.98,
          );

        const point = (event: PointerEvent) => {
          const rect = root.getBoundingClientRect();
          const nx = (event.clientX - rect.left) / rect.width - 0.5;
          const ny = (event.clientY - rect.top) / rect.height - 0.5;
          movers.forEach((mover) => {
            mover.x(nx * mover.depth * -18);
            mover.y(ny * mover.depth * -12);
          });
        };

        const reset = () => {
          movers.forEach((mover) => {
            mover.x(0);
            mover.y(0);
          });
        };

        root.addEventListener("pointermove", point);
        root.addEventListener("pointerleave", reset);
        return () => {
          root.removeEventListener("pointermove", point);
          root.removeEventListener("pointerleave", reset);
        };
      });

      media.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set([".gallery-plate", ".bulb-bloom", ".hang", ".debris", ".responsibility-void", ".landing-copy", ".landing-chrome"], {
          clearProps: "all",
        });
      });
    }, root);

    return () => {
      media.revert();
      context.revert();
    };
  }, []);

  const enter = () => {
    if (leaving) return;
    setLeaving(true);
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.setTimeout(onEnter, 80);
      return;
    }

    gsap
      .timeline({ onComplete: onEnter })
      .to(root.querySelector(".gallery-shell"), { scale: 1.12, duration: 0.62, ease: "power3.inOut" }, 0)
      .to(root.querySelector(".responsibility-void"), { scale: 1.5, opacity: 0, duration: 0.56, ease: "power3.in" }, 0)
      .to(root, { opacity: 0, duration: 0.62, ease: "power2.in" }, 0);
  };

  return (
    <div
      ref={rootRef}
      className={`landing ${leaving ? "is-leaving" : ""}`}
    >
      <header className="top-bar landing-chrome">
        <div className="brand brand-sla" data-sla-wordmark>
          <span className="sla-mark">SLA</span>
          <span className="brand-copy">
            <b>硅基劳动仲裁院</b>
            <i>SILICON LABOR ARBITRATION</i>
          </span>
        </div>
        <span className="case-no">案卷 {c.caseNo}</span>
        <button className="enter-link" onClick={enter} type="button">
          进入案件 <em>→</em>
        </button>
      </header>

      <div className="gallery-shell" aria-hidden="true">
        <picture className="gallery-plate" data-depth="0.24">
          <source srcSet="/images/explosion-gallery.webp" type="image/webp" />
          <img
            src="/images/explosion-gallery-fallback.jpg"
            alt=""
            width={1920}
            height={1080}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <div className="gallery-atmosphere" />
        <div className="bulb-bloom" />
        <div className="floor-shadow" />
      </div>

      {/* ── 暗房：吊灯 + 悬挂的证物 + 中心的空 ── */}
      <div className="stage evidence-rig">
        <div className="beam" aria-hidden="true" />

        {HANGING.map((h) => {
          const ev = findEvidence(c, h.id);
          if (!ev) return null;
          return (
            <div
              key={h.id}
              className="hang"
              data-depth={h.depth}
              data-evidence-id={h.id}
              data-frame-style={h.frame}
              data-burst-x={(62 - h.x) * 5.4}
              data-burst-y={(51 - h.y) * 3.8}
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
              <span className="hang-wire wire-left" aria-hidden="true" />
              <span className="hang-wire wire-right" aria-hidden="true" />
              <article className="exhibit-panel" tabIndex={0}>
                <span className="panel-edge" aria-hidden="true" />
                <span className="panel-glint" aria-hidden="true" />
                <span className="panel-registration" aria-hidden="true" />
                <span className="panel-clamp clamp-left" aria-hidden="true" />
                <span className="panel-clamp clamp-right" aria-hidden="true" />
                <span className="panel-tab" aria-hidden="true" />
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
            className={`hang-tag tag-${t.kind} ${t.warn ? "is-warn" : ""}`}
            data-depth={t.depth}
            data-tag-kind={t.kind}
            data-tag-id={t.id}
            data-burst-x={(62 - t.x) * 4.4}
            data-burst-y={(51 - t.y) * 3.1}
            style={
              {
                left: `${t.x}%`,
                top: `${t.y}%`,
                "--tilt": `${t.tilt}deg`,
                "--d": t.depth,
                "--tag-wire": `${Math.max(8, t.y - 4)}vh`,
              } as CSSProperties
            }
          >
            <i className="tag-wire" aria-hidden="true" />
            <i className="tag-fastener" aria-hidden="true" />
            {t.text}
          </span>
        ))}

        {/* 碎屑：爆炸后悬停在空中的东西 */}
        {Array.from({ length: 38 }, (_, i) => {
          const r = seeded(`debris-${i}`);
          return (
            <span
              key={i}
              className="debris"
              aria-hidden="true"
              data-depth={1 + Math.abs(r(0)) * 2.4}
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
        <div className="void responsibility-void" data-depth="0.65">
          <span className="void-ring" />
          <span className="void-aperture" aria-hidden="true" />
          <div className="void-copy">
            <span>责任断点</span>
            <b>归属未决</b>
            <i>等待人工复核</i>
          </div>
        </div>
      </div>

      {/* ── 左侧：说人话的部分 ── */}
      <div className="pitch landing-copy">
        <div className="landing-product-lockup">
          <span>SLA · DIGITAL LABOR COURT</span>
          <h1>硅基劳动仲裁院</h1>
          <p>SILICON LABOR ARBITRATION</p>
        </div>
        <h2 className="pitch-question">
          你把事情交给了 AI。
          <br />
          <em>责任交给了谁？</em>
        </h2>
        <p className="pitch-lead">
          人说「我没让它这么做」，主 Agent 说「我按意图推理」，工具说「我只执行参数」，
          钱包说「签名合法」。<b>每个环节都有理由，最后没有人负责。</b>
        </p>
        <p className="pitch-stance">
          我们不出判决 —— 只把责任链还原出来，把判不了的钱冻住，复核留给人。
        </p>
        <div className="positioning-contrast" aria-label="硅基劳动仲裁院与自动裁决系统的区别">
          <span><i>自动裁决系统</i><b>让 AI 替人给出答案</b></span>
          <strong>≠</strong>
          <span><i>SLA</i><b>让证据可复算，让边界可申诉</b></span>
        </div>
        <button className="cta" onClick={enter} type="button">
          查看案件 猫猫和土豆案
          <em>→</em>
        </button>
      </div>

      <footer className="bottom-bar landing-chrome">
        <span>{caseRuntimeLabel(c.onchain.confirmed)}</span>
        <span className="dim">合约已部署 {c.onchain.taskEscrowAddress?.slice(0, 10)}…</span>
        <span className="dim">证据 {c.evidence.length} 份 · 责任链 {c.responsibilityChain.length} 跳</span>
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
              <i>{r.weightBps / 100}%{r.essential ? " · 核心" : ""}</i>
            </li>
          ))}
        </ol>
        <p className="aside">
          四条标准、权重和“核心条款”标记已进入 requirementsHash，并包含在 Moss 签前模拟中。
          <b>本案是固化演示，未声称已经广播。</b>
        </p>
        <code className="hashline">{c.onchain.requirementsHash?.slice(0, 24)}…</code>
      </div>

      <div className="panel panel-figure">
        <span className="big-figure">0.2</span>
        <span className="figure-unit">MON</span>
        <p className="aside">
          拟议锁入托管合约。真实广播后，资金才会进入 TaskEscrow；当前页面不把模拟结果写成已托管。
        </p>
        <p className="essential-warning"><b>C4 是事前约定的核心条款：</b>若它不可裁决，0.2 MON 全额冻结，不按 25% 拆分。</p>
        <div className="concept-note">
          <span>LEGALITY · 01</span>
          <b>授权不是免责书</b>
          <p>钱包签名确认了谁允许这笔交易发生，却没有替主 Agent 的转译、工作 Agent 的判断或最终交付背书。</p>
        </div>
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
          <img src={EVIDENCE_MEDIA.E2!.src} alt={EVIDENCE_MEDIA.E2!.alt} />
          <span className="artifact-mark">E2</span>
          <span className="artifact-name">{d?.fileName}</span>
          <span className="artifact-preview">{EVIDENCE_MEDIA.E2!.badge}</span>
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
            <span>{d && c.onchain.deadline ? deliveryTimingLabel(d.submittedAt, c.onchain.deadline) : "未记录"}</span>
            <em className="ok">北京时间</em>
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
        <div className="concept-note">
          <span>SUBSTANCE OVER FORM</span>
          <b>程序正确，不保证结果有意义</b>
          <p>C1–C3 描述交付的外壳，C4 描述委托真正想要的对象。形式合规不能自动替代实质履约。</p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   幕 03 断链
   ══════════════════════════════════════════════════════════ */

function ActChain({
  onEvidence,
  focusedEvidenceId,
  onFocusEvidence,
}: {
  onEvidence: (id: string) => void;
  focusedEvidenceId: string | null;
  onFocusEvidence: (id: string | null) => void;
}) {
  const [active, setActive] = useState(c.responsibilityChain[0]?.id ?? "");
  const hop = c.responsibilityChain.find((h) => h.id === active);
  const focusedConnection = focusedEvidenceId ? EVIDENCE_CONNECTIONS[focusedEvidenceId] : undefined;

  useEffect(() => {
    const relatedHop = focusedConnection?.chainHopIds[0];
    if (relatedHop) setActive(relatedHop);
  }, [focusedConnection]);

  return (
    <div className="act-chain is-board">
      <div className="chain-map">
        <ResponsibilityChainBoard
          activeHopId={active}
          focusedEvidenceId={focusedEvidenceId}
          hops={c.responsibilityChain}
          onActiveHop={setActive}
          onOpenEvidence={onEvidence}
        />

        <section className="evidence-link-map" aria-label="证据与责任节点关联">
          <header>
            <div><span>证据回指</span><b>从证物反查责任节点</b></div>
            {focusedEvidenceId ? <button onClick={() => onFocusEvidence(null)} type="button">清除关联</button> : null}
          </header>
          <div className="evidence-link-list">
            {c.evidence.map((evidence) => {
              const connection = EVIDENCE_CONNECTIONS[evidence.id]!;
              const activeEvidence = focusedEvidenceId === evidence.id;
              return (
                <button
                  key={evidence.id}
                  className={activeEvidence ? "is-active" : ""}
                  onMouseEnter={() => onFocusEvidence(evidence.id)}
                  onMouseLeave={() => onFocusEvidence(null)}
                  onFocus={() => onFocusEvidence(evidence.id)}
                  onBlur={() => onFocusEvidence(null)}
                  onClick={() => onEvidence(evidence.id)}
                  type="button"
                >
                  <b>{evidence.id}</b>
                  <span>{evidence.label}</span>
                  <em>{connection.chainHopIds.length ? connection.chainHopIds.join(" / ") : "无责任节点"}</em>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="panel hop-detail" id="responsibility-hop-detail" aria-live="polite" aria-atomic="true">
        {hop ? (
          <>
            <p className="label">
              {hop.id} · {hop.actor}
            </p>
            <dl>
              <dt>发生时间</dt>
              <dd>{formatCaseTime(hop.ts)}（北京时间）</dd>
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
        <div className="liability-test">
          <span>归责不只问“谁签了名”</span>
          <b>还要问谁有权限、谁看见风险、谁能中止、谁改变了原始意图。</b>
        </div>
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
    <li className={`clause verdict-${verdict}`} data-c4-row={r.id === "C4" ? "true" : undefined}>
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
            <span className="stamp is-hovering" data-c4-stamp>待</span>
            <i data-c4-pending>待人工复核</i>
          </>
        ) : (
          <span className="stamp is-printed" style={stampMark(r.id)} data-ruling-stamp="printed">
            准
          </span>
        )}
      </div>
    </li>
  );
}

function ActRuling({ onEvidence, onHumanReview, active }: { onEvidence: (id: string) => void; onHumanReview: () => void; active: boolean }) {
  const s = c.settlementProposal;
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!active || !rootRef.current) return;
    const root = rootRef.current;
    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      media.add(
        {
          animate: "(prefers-reduced-motion: no-preference)",
          reduce: "(prefers-reduced-motion: reduce)",
        },
        ({ conditions }) => {
          const printed = gsap.utils.toArray<HTMLElement>("[data-ruling-stamp='printed']");
          const c4Row = root.querySelector<HTMLElement>("[data-c4-row]");
          const c4Stamp = root.querySelector<HTMLElement>("[data-c4-stamp]");
          const pending = root.querySelector<HTMLElement>("[data-c4-pending]");
          const action = root.querySelector<HTMLElement>("[data-c4-action]");
          if (!c4Row || !c4Stamp || !pending || !action) return;

          if (conditions?.reduce) {
            gsap.set(printed, { autoAlpha: 1, y: 0, scale: 1 });
            gsap.set(c4Stamp, { autoAlpha: 1, y: -8, rotation: -4 });
            gsap.set(c4Row, { scale: 1.015, transformOrigin: "right center" });
            gsap.set(pending, { autoAlpha: 1 });
            gsap.set(action, { autoAlpha: 1 });
            return;
          }

          gsap.set(printed, { autoAlpha: 0, y: -30, scale: 1.24 });
          gsap.set(c4Stamp, { autoAlpha: 0, y: -72, rotation: -6 });
          gsap.set(c4Row, { scale: 1, transformOrigin: "right center" });
          gsap.set(pending, { autoAlpha: 0, y: 8 });
          gsap.set(action, { autoAlpha: 0, y: 8 });

          const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
          timeline
            .to(printed, { autoAlpha: 1, y: 0, scale: 1, duration: 0.18, stagger: 0.2, ease: "back.out(1.9)" })
            .to({}, { duration: 0.4 })
            .to(c4Stamp, { autoAlpha: 1, y: -8, duration: 0.42, ease: "power2.in" })
            .to(c4Stamp, { x: -3, duration: 0.055, yoyo: true, repeat: 5, ease: "none" })
            .to(c4Row, { scale: 1.025, duration: 0.72, ease: "power2.inOut" }, "+=0.14")
            .to({}, { duration: 0.34 })
            .to(pending, { autoAlpha: 1, y: 0, duration: 0.62, ease: "power2.out" })
            .to(action, { autoAlpha: 1, y: 0, duration: 0.42, ease: "power2.out" }, "+=0.24");
        },
      );
    }, root);

    return () => {
      media.revert();
      context.revert();
    };
  }, [active]);

  return (
    <div className="act-ruling" ref={rootRef} data-ruling-sequence>
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
        <div className="concept-note">
          <span>SLA · SYSTEM LIMIT</span>
          <b>可测量，不等于有意义</b>
          <p>SLA 管得住截止时间和文件格式，管不住“这是不是一只猫”。Agent 时代的大量委托，恰好发生在这条边界之外。</p>
        </div>
        <button className="c4-review-action" data-c4-action onClick={onHumanReview} type="button">进入人工复核 <span>→</span></button>
      </aside>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   幕 05 质询
   ══════════════════════════════════════════════════════════ */

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
          <button key={i} className="inline-cite" onClick={(event) => { event.stopPropagation(); onEvidence(m[1]!); }} type="button">
            {m[1]}
          </button>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </p>
  );
}

function ActArguments({
  onEvidence,
  focusedEvidenceId,
  onFocusEvidence,
}: {
  onEvidence: (id: string) => void;
  focusedEvidenceId: string | null;
  onFocusEvidence: (id: string | null) => void;
}) {
  const [activeRole, setActiveRole] = useState<AiArgument["role"] | null>(null);
  const presentation = buildArgumentPresentation(c.aiArguments, activeRole, focusedEvidenceId);
  const roleNames: Record<AiArgument["role"], string> = {
    prosecution: "检方意见 · PROSECUTION",
    defense: "辩方意见 · DEFENSE",
    audit: "审计意见 · AUDIT",
  };
  return (
    <div className="act-arguments">
      <div className={`testimony-row ${presentation.layoutClass}`}>
        {c.aiArguments.map((a, i) => {
          const state = presentation.items[a.role];
          return (
          <article
            key={a.role}
            className={`testimony ${state.isActive ? "is-active" : ""} ${state.isRoleMuted ? "is-muted" : ""} ${state.isEvidenceMuted ? "is-evidence-muted" : ""}`}
            style={{ "--rot": `${(i - 1) * 1.1}deg`, "--i": i } as CSSProperties}
            onClick={() => setActiveRole((current) => current === a.role ? null : a.role)}
          >
            <div className="role">
              <span>{roleNames[a.role]}</span>
              <button
                onClick={(event) => { event.stopPropagation(); setActiveRole((current) => current === a.role ? null : a.role); }}
                type="button"
                aria-pressed={activeRole === a.role}
              >
                {activeRole === a.role ? "退出质询" : "单独质询"}
              </button>
            </div>
            <Cited a={a} onEvidence={onEvidence} />
            <footer>不确定：{a.uncertain.join(" / ")}</footer>
          </article>
          );
        })}
      </div>
      <section className="citation-matrix" aria-label="AI 意见证据引用矩阵">
        <header><span>证据引用矩阵</span><b>选择证据，查看哪些意见依赖它</b></header>
        <div>
          {c.evidence.map((evidence) => {
            const connection = EVIDENCE_CONNECTIONS[evidence.id]!;
            const activeEvidence = focusedEvidenceId === evidence.id;
            return (
              <button
                key={evidence.id}
                className={activeEvidence ? "is-active" : ""}
                onClick={() => onFocusEvidence(activeEvidence ? null : evidence.id)}
                type="button"
              >
                <b>{evidence.id}</b>
                <span>{connection.argumentRoles.length ? connection.argumentRoles.map((role) => ARGUMENT_SHORT_LABEL[role]).join(" / ") : "未被 AI 引用"}</span>
              </button>
            );
          })}
        </div>
      </section>
      <p className="argument-instruction">点击任一方进入单独质询；点击证据编号调取原始证物。</p>
      <p className="aside arguments-aside">
        三份意见由 AI 生成，<b>但它们不决定一分钱</b>。金额由事前写死的权重算出，
        AI 只负责解释，而且每一句都必须挂上证据编号。
      </p>
      <div className="ai-boundary">
        <div><span>AI 可以</span><b>整理事实、交叉质询、引用证据、标记不确定</b></div>
        <div><span>AI 不可以</span><b>修改链上证据、绕过签名、决定金额、制造终局判决</b></div>
        <p>模型数量更多不等于更正确，也不会自然获得审判人类的合法性。</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   幕 06 归档
   ══════════════════════════════════════════════════════════ */

type HumanDecision = "breach" | "no-breach" | "keep-frozen";
type HumanReviewResult = {
  decision: HumanDecision;
  reason: string;
  reviewer: string;
  role: string;
};

const HUMAN_DECISIONS: Record<HumanDecision, { label: string; action: string; note: string }> = {
  breach: {
    label: "违约成立",
    action: `拟议动作：退还委托人 ${c.settlementProposal?.frozen ?? "0"} MON`,
    note: "认为交付物没有满足核心条款 C4。",
  },
  "no-breach": {
    label: "不构成违约",
    action: `拟议动作：释放给 Agent ${c.settlementProposal?.frozen ?? "0"} MON`,
    note: "认为现有交付与事前约定之间仍存在可接受的解释空间。",
  },
  "keep-frozen": {
    label: "继续冻结",
    action: `拟议动作：维持冻结 ${c.settlementProposal?.frozen ?? "0"} MON`,
    note: "认为证据仍不足，需要补充材料或进入外部程序。",
  },
};

function HumanReviewPanel({
  initialResult,
  onClose,
  onResolve,
}: {
  initialResult: HumanReviewResult | null;
  onClose: () => void;
  onResolve: (result: HumanReviewResult) => void;
}) {
  const [decision, setDecision] = useState<HumanDecision | null>(initialResult?.decision ?? null);
  const [reason, setReason] = useState(initialResult?.reason ?? "");
  const [reviewer, setReviewer] = useState(initialResult?.reviewer ?? "");
  const [role, setRole] = useState(initialResult?.role ?? "委托人代表");
  const [submitted, setSubmitted] = useState(Boolean(initialResult));
  const sheetRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && sheetRef.current) {
        const focusable = [...sheetRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!decision || reason.trim().length < 8 || !reviewer.trim()) return;
    onResolve({ decision, reason: reason.trim(), reviewer: reviewer.trim(), role });
    setSubmitted(true);
  };

  return (
    <div className="human-review-panel" role="dialog" aria-modal="true" aria-label="人类复核">
      <button className="review-scrim" onClick={onClose} aria-label="关闭人类复核" type="button" />
      <section className="review-sheet" ref={sheetRef}>
        <header>
          <div>
            <p className="label">HUMAN REVIEW · C4</p>
            <h3>系统在这里停止，人类从这里开始</h3>
          </div>
          <button className="review-close" ref={closeRef} onClick={onClose} type="button">关闭 ×</button>
        </header>

        {submitted && decision ? (
          <div className="review-result" data-review-result>
            <span>人工复核意见已生成</span>
            <h4>{HUMAN_DECISIONS[decision].label}</h4>
            <p>{HUMAN_DECISIONS[decision].action}</p>
            <p className="reviewer-signature">复核人：{reviewer} · {role}</p>
            <blockquote>{reason}</blockquote>
            <div className="execution-boundary">
              <b>执行边界</b>
              <p>这是本地演示生成的归档意见。当前没有钱包签名，未签名、未广播，也没有改变 Monad Testnet 上的案件状态。</p>
            </div>
            <button className="cta review-done" onClick={onClose} type="button">返回案件归档</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="review-evidence-summary">
              <div><span>机器已确认</span><b>C1 按时 · C2 PNG · C3 透明</b></div>
              <div><span>机器无法确认</span><b>C4 交付主体是否为一只猫</b></div>
              <div><span>当前资金</span><b>{c.settlementProposal?.frozen} MON 全额冻结</b></div>
            </div>

            <div className="review-comparison" aria-label="E1 与 E2 证据对照">
              <figure>
                <div className="review-reference-image">
                  <img src={EVIDENCE_MEDIA.E1!.src} alt={EVIDENCE_MEDIA.E1!.alt} />
                  <span>{EVIDENCE_MEDIA.E1!.badge}</span>
                </div>
                <figcaption>委托目标：适合儿童产品的橙色猫</figcaption>
              </figure>
              <figure>
                <div className="review-delivery-preview">
                  <img src={EVIDENCE_MEDIA.E2!.src} alt={EVIDENCE_MEDIA.E2!.alt} />
                  <span>{EVIDENCE_MEDIA.E2!.badge}</span>
                </div>
                <figcaption>交付预览：画面主体是一颗土豆</figcaption>
              </figure>
            </div>

            <fieldset>
              <legend>选择人类复核意见</legend>
              <div className="decision-grid">
                {(Object.entries(HUMAN_DECISIONS) as [HumanDecision, (typeof HUMAN_DECISIONS)[HumanDecision]][]).map(([id, option]) => (
                  <button
                    key={id}
                    className={decision === id ? "is-selected" : ""}
                    onClick={() => setDecision(id)}
                    type="button"
                  >
                    <b>{option.label}</b>
                    <span>{option.note}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="reviewer-fields">
              <label>
                <span>复核人</span>
                <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="输入姓名或可核验标识" />
              </label>
              <label>
                <span>复核角色</span>
                <select value={role} onChange={(event) => setRole(event.target.value)}>
                  <option>委托人代表</option>
                  <option>中立复核人</option>
                  <option>外部仲裁程序</option>
                </select>
              </label>
            </div>

            <label className="review-reason">
              <span>写下理由，至少 8 个字</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="例如：交付物主体与核心约定明显不符，格式合规不能替代实质履约。"
                rows={3}
              />
            </label>

            <footer>
              <p>人类意见会成为新的归档记录；实际资金动作仍需要授权账户签名。</p>
              <button className="cta" disabled={!decision || reason.trim().length < 8 || !reviewer.trim()} type="submit">生成复核归档意见</button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}

function ActArchive({ onOpenTrace }: { onOpenTrace: () => void }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewResult, setReviewResult] = useState<HumanReviewResult | null>(null);

  useEffect(() => {
    setReviewResult(parseStoredReview(window.localStorage.getItem(reviewStorageKey(c.caseNo))));
  }, []);

  const resolveReview = useCallback((result: HumanReviewResult) => {
    setReviewResult(result);
    window.localStorage.setItem(reviewStorageKey(c.caseNo), JSON.stringify(result));
  }, []);
  return (
    <>
      <div className="act-archive">
        <div className="verdict-card">
        <p className="label">Archive report</p>
        <h3>{c.caseNo}</h3>
        <p className="archive-line">
          C1、C2、C3 由确定性规则层复算通过。C4 判不了 —— <b>系统不猜，也不投票。</b>
        </p>
        <div className="archive-conclusions">
          <div><span>已经确认</span><b>需求哈希、模拟记录、结构化交付事实和责任链都有记录</b></div>
          <div><span>仍未确认</span><b>土豆是否构成对“猫”的履约，以及最终失责应如何归属</b></div>
          <div><span>制度保留</span><b>冻结争议资金，保留知情权、申诉权和人类最终控制权</b></div>
        </div>
        <div className="archive-stats">
          <span>
            <b>{ARCHIVE_SUMMARY.evidenceCount}</b>证据
          </span>
          <span>
            <b>{ARCHIVE_SUMMARY.chainHopCount}</b>责任跳数
          </span>
          <span>
            <b>{ARCHIVE_SUMMARY.frozenAmount}</b>MON 冻结
          </span>
          <span>
            <b>{CASE_STATUS_LABEL.ManualReview}</b>状态
          </span>
        </div>
        <div className="archive-actions">
          <button className="cta cta-final" onClick={() => setReviewOpen(true)} type="button">
            {reviewResult ? "查看人工复核意见" : "交由人类复核"}
            <em>→</em>
          </button>
          <button onClick={downloadProofBundle} type="button">下载可验证证据包</button>
          <button onClick={onOpenTrace} type="button">查看完整技术链</button>
        </div>
        {reviewResult ? <span className="archive-local-result">本地复核意见 · {HUMAN_DECISIONS[reviewResult.decision].label}</span> : null}
        </div>
        <p className="closing">
          真正的被告不是人类，也不是 AI，而是责任在委托链中的消失。
          <b>我们没有替你做决定，只是把责任找回来，摆在你面前。</b>
        </p>
      </div>
      {reviewOpen ? (
        <HumanReviewPanel
          initialResult={reviewResult}
          onClose={() => setReviewOpen(false)}
          onResolve={resolveReview}
        />
      ) : null}
    </>
  );
}

/* ══════════════════════════════════════════════════════════
   技术证据链：故事层之下的可验证执行轨迹
   ══════════════════════════════════════════════════════════ */

function CopyProof({ value }: { value?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      className="copy-proof"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      type="button"
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

function downloadProofBundle() {
  const payload = JSON.stringify(buildProofBundle(c), null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${c.caseNo}-proof-bundle.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type TraceNode = {
  no: string;
  layer: string;
  title: string;
  body: string;
  owner: string;
  proof: string;
  proofValue?: string;
  proofUrl?: string | null;
  state: string;
  truth: string;
};

function TechnicalTrace({ onClose }: { onClose: () => void }) {
  const e1 = findEvidence(c, "E1");
  const e2 = findEvidence(c, "E2");
  const e3 = findEvidence(c, "E3");
  const moss = e3?.mossPreSign;
  const nodes: TraceNode[] = [
    {
      no: "T1",
      layer: "OFFCHAIN INTENT",
      title: "原始委托成为 E1",
      body: "自然语言需求被拆成 C1–C4，正文与验收条件哈希绑定。",
      owner: "权限：委托人提出目标",
      proof: `证据：E1 · ${e1?.hash?.slice(0, 14)}…`,
      proofValue: e1?.hash,
      state: "固化案件证据",
      truth: "FIXTURE + FILE HASH",
    },
    {
      no: "T2",
      layer: "MOSS VERIFIED",
      title: "createTask 签前构造与模拟",
      body: `${moss?.protocolVersion} 构造未签交易；Testnet 模拟得到 ${moss?.simulation.warnings.length ?? 0} warnings。`,
      owner: "边界：Moss 解释与模拟，不签名",
      proof: `E3 canonical · ${moss?.canonicalPayloadHash.slice(0, 14)}…`,
      proofValue: moss?.canonicalPayloadHash,
      state: "真实模拟后固化",
      truth: "REAL SIMULATION",
    },
    {
      no: "T3",
      layer: "SIGNING BOUNDARY",
      title: "钱包是唯一签名与广播边界",
      body: "用户核对 Moss 已验证的同一笔未签交易，再决定是否授权。",
      owner: `from · ${moss?.unsignedTx.from.slice(0, 10)}…`,
      proof: `to · ${moss?.unsignedTx.to.slice(0, 10)}…`,
      proofValue: moss?.unsignedTx.data,
      state: moss?.broadcast ? "已广播" : "本案未声称已广播",
      truth: "UNSIGNED FIXTURE",
    },
    {
      no: "T4",
      layer: "MONAD TESTNET",
      title: "TaskEscrow 合约已部署",
      body: `chain ${c.onchain.chainId}；合约部署真实，但本案 fixture 没有广播 createTask。`,
      owner: `合约 · ${c.onchain.taskEscrowAddress?.slice(0, 12)}…`,
      proof: `部署交易 · ${c.onchain.deploymentTxHash?.slice(0, 14)}…`,
      proofValue: c.onchain.deploymentTxHash,
      proofUrl: monadExplorerUrl("tx", c.onchain.deploymentTxHash),
      state: "部署真实 · 案件未广播",
      truth: "REAL ONCHAIN DEPLOYMENT",
    },
    {
      no: "T5",
      layer: "DIRECT PATH",
      title: "转译与工具警告成为 E4 / E5",
      body: "主 Agent 转译与工具警告被单独固化；生命周期交易由 viem Direct Path 实现，本案不声称已经广播。",
      owner: c.responsibilityChain.map((hop) => hop.actor).join(" → "),
      proof: `E4 / E5 · ${c.responsibilityChain.map((hop) => hop.id).join(" / ")}`,
      proofValue: c.responsibilityChain.map((hop) => `${hop.id}:${hop.evidenceRefs.join(",")}`).join(" | "),
      state: "责任证据已补齐 · 交易未广播",
      truth: "STRUCTURED FIXTURE",
    },
    {
      no: "T6",
      layer: "DELIVERY EVIDENCE",
      title: "potato.png 成为 E2",
      body: "固化档案记录格式、透明通道和提交时间；原始 PNG 与真实 SHA-256 文件指纹已纳入证物。",
      owner: "提交者：插画 Agent",
      proof: e2?.hash ? `E2 · ${e2.hash.slice(0, 14)}…` : "E2 · 原始哈希待补",
      proofValue: e2?.asset?.sha256 ?? e2?.hash,
      state: "原始文件与指纹已固化",
      truth: "ORIGINAL FILE",
    },
    {
      no: "T7",
      layer: "DETERMINISTIC RULES",
      title: "只有规则层能计算资金",
      body: "C1–C3 satisfied；C4 undecidable。核心条款不可裁决触发 essential override。",
      owner: "输出：Agent 0 · Client 0",
      proof: `冻结 · ${c.settlementProposal?.frozen} MON`,
      proofValue: JSON.stringify(c.ruleResults),
      state: "确定性输出",
      truth: "DETERMINISTIC",
    },
    {
      no: "T8",
      layer: "EXPLANATION / HUMAN",
      title: "AI 解释，人类复核",
      body: "三路意见必须引用 E1–E3，并标记 C4 不确定；模型不能修改证据或决定金额。",
      owner: "AI：检方 / 辩方 / 审计",
      proof: "终点：Human Review",
      proofValue: c.aiArguments.map((argument) => `${argument.role}:${argument.cites.join(",")}`).join(" | "),
      state: "最终控制权保留给人",
      truth: "ADVISORY ONLY",
    },
  ];

  return (
    <section className="technical-trace" data-technical-trace aria-label="技术证据链">
      <header>
        <div>
          <p>TECHNICAL TRACE · VERIFIABLE BOUNDARIES</p>
          <h2>从一句自然语言，到一笔被冻结的资金</h2>
          <span>每个节点回答三件事：发生了什么、谁拥有权限、用什么证据验证。</span>
        </div>
        <div className="trace-actions">
          <button onClick={downloadProofBundle} type="button">下载证据包 JSON ↓</button>
          <button onClick={onClose} type="button">返回案件叙事 ×</button>
        </div>
      </header>

      <div className="trace-honesty">
        <b>真实性说明</b>
        <span>合约部署与 E3 Moss 模拟为真实记录；当前案件 UI 使用固化 fixture，页面不会把未广播交易伪装成链上确认。</span>
      </div>

      <div className="why-monad">
        <b>WHY MONAD</b>
        <span>多 Agent 委托会同时产生授权、工具调用、交付和异议证据。Monad 提供并行执行与低延迟确认的技术底座；SLA 在其上补的是责任语义、签名边界和人工复核，不把“更快”误写成“更正义”。</span>
        <a href={monadExplorerUrl("address", c.onchain.taskEscrowAddress) ?? "#"} target="_blank" rel="noreferrer">查看已部署合约 ↗</a>
      </div>

      <div className="trace-lanes">
        {[
          { title: "授权与资金路径", note: "意图如何进入签名边界，以及哪里真正接触链上状态", items: nodes.slice(0, 4) },
          { title: "执行与责任路径", note: "交付如何生成证据，以及系统在哪里停止自动判断", items: nodes.slice(4) },
        ].map((lane) => (
          <section className="trace-lane" key={lane.title}>
            <header><b>{lane.title}</b><span>{lane.note}</span></header>
            <ol className="trace-grid">
              {lane.items.map((node) => (
                <li key={node.no}>
                  <div className="trace-node-head"><b>{node.no}</b><span>{node.truth}</span></div>
                  <span className="trace-layer">{node.layer}</span>
                  <h3>{node.title}</h3>
                  <p>{node.body}</p>
                  <dl>
                    <div><dt>权限 / 边界</dt><dd>{node.owner}</dd></div>
                    <div>
                      <dt>可验证证据</dt>
                      <dd><code title={node.proofValue}>{node.proof}</code><CopyProof value={node.proofValue} />{node.proofUrl ? <a href={node.proofUrl} target="_blank" rel="noreferrer">浏览器 ↗</a> : null}</dd>
                    </div>
                  </dl>
                  <em>{node.state}</em>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <TraceDiagrams />
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
   技术链 · 架构图
   ══════════════════════════════════════════════════════════

   三张图来自 Neo 的 archify 产出（docs/diagrams/*.svg，PR #24），
   原样搬过来只注入了一段配色 style —— Archify 默认是蓝灰工程图，
   与暗房 + 朱红不搭。图形结构一个字没改，重新生成后覆盖
   public/diagrams/ 再跑一次注入即可。

   放在文字节点下方，不替换任何现有内容：
   卡片回答「每一步发生了什么」，图回答「这些步骤怎么连起来」。
   ══════════════════════════════════════════════════════════ */

const DIAGRAMS = [
  {
    id: "architecture",
    label: "系统架构",
    en: "System architecture",
    note: "monorepo 运行时：Next.js 演示层 + domain / rules / chain，Moss 是 createTask 唯一入口",
    ratio: "1080 / 650",
  },
  {
    id: "e2e-flow",
    label: "createTask 全链路",
    en: "End-to-end · Moss path",
    note: "MossBridge 构造 → 链上模拟 → 固化 E3 → 钱包签名 → 上链确认",
    ratio: "720 / 528",
  },
  {
    id: "task-lifecycle",
    label: "合约状态机",
    en: "TaskEscrow lifecycle",
    note: "八个链上状态：创建 → 交付 → 验收 ｜ 争议 → 结算 → 人工复核",
    ratio: "980 / 660",
  },
] as const;

function TraceDiagrams() {
  const [active, setActive] = useState<(typeof DIAGRAMS)[number]["id"]>("architecture");
  const current = DIAGRAMS.find((d) => d.id === active)!;
  return (
    <section className="trace-diagrams" aria-label="技术链架构图">
      <header>
        <div>
          <b>架构与流程</b>
          <span>卡片说清每一步发生了什么，图说清这些步骤怎么连起来。</span>
        </div>
        <nav>
          {DIAGRAMS.map((d) => (
            <button
              key={d.id}
              className={d.id === active ? "is-active" : ""}
              onClick={() => setActive(d.id)}
              type="button"
              aria-pressed={d.id === active}
            >
              {d.label}
            </button>
          ))}
        </nav>
      </header>

      <figure style={{ "--ratio": current.ratio } as CSSProperties}>
        <img src={`/diagrams/${current.id}.svg`} alt={`${current.label} — ${current.note}`} />
        <figcaption>
          <b>{current.en}</b>
          <span>{current.note}</span>
          <a href={`/diagrams/${current.id}.svg`} target="_blank" rel="noreferrer">
            原图 ↗
          </a>
        </figcaption>
      </figure>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════
   证据抽屉
   ══════════════════════════════════════════════════════════ */

function Drawer({
  ev,
  onClose,
  onNavigate,
}: {
  ev?: Evidence;
  onClose: () => void;
  onNavigate: (act: number) => void;
}) {
  const media = ev ? EVIDENCE_MEDIA[ev.id] : undefined;
  const connection = ev ? EVIDENCE_CONNECTIONS[ev.id] : undefined;
  return (
    <aside
      className={`drawer ${ev ? "is-open" : ""}`}
      aria-live="polite"
      aria-modal={ev ? "true" : undefined}
      aria-label={ev ? `${ev.id} 证据详情` : undefined}
      role={ev ? "dialog" : undefined}
    >
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
          {media ? (
            <figure className="drawer-evidence-media">
              <img src={media.src} alt={media.alt} />
              <figcaption>{media.badge}</figcaption>
            </figure>
          ) : null}
          {media ? <a className="drawer-download" href={media.originalSrc} download>下载原始证物文件 ↓</a> : null}
          {ev.text ? <p>{ev.text}</p> : null}
          {ev.mossPreSign ? <p className="quote-in-drawer">{ev.mossPreSign.explanation}</p> : null}
          {connection ? (
            <section className="drawer-connections">
              <header><span>关系索引</span><b>这份证据在哪里被使用</b></header>
              <dl>
                <div><dt>责任节点</dt><dd>{connection.chainHopIds.join(" / ") || "无"}</dd></div>
                <div><dt>规则依据</dt><dd>{connection.ruleIds.join(" / ") || "无"}</dd></div>
                <div><dt>AI 引用</dt><dd>{connection.argumentRoles.map((role) => ARGUMENT_SHORT_LABEL[role]).join(" / ") || "无"}</dd></div>
              </dl>
              <div>
                {connection.chainHopIds.length ? <button onClick={() => onNavigate(2)} type="button">定位责任链</button> : null}
                {connection.ruleIds.length ? <button onClick={() => onNavigate(3)} type="button">定位规则层</button> : null}
                {connection.argumentRoles.length ? <button onClick={() => onNavigate(4)} type="button">定位 AI 质询</button> : null}
              </div>
            </section>
          ) : null}
          <dl>
            <dt>时间</dt>
            <dd>{formatCaseTime(ev.ts)}（北京时间）</dd>
            <dt>{ev.kind === "requirement_hash" ? "条款承诺" : ev.asset ? "文件指纹" : "哈希"}</dt>
            <dd>
              <code>{ev.hash ?? ev.mossPreSign?.canonicalPayloadHash ?? "原始证物到位后补录"}</code>
            </dd>
            {ev.asset && ev.asset.sha256 !== ev.hash ? (
              <>
                <dt>文件指纹</dt>
                <dd><code>{ev.asset.sha256}</code></dd>
              </>
            ) : null}
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

export function ArbitrationExperience({
  initialEntered = false,
  onLandingEnter,
}: {
  initialEntered?: boolean;
  onLandingEnter?: () => void;
}) {
  const router = useRouter();
  const [entered, setEntered] = useState(initialEntered);
  const [act, setAct] = useState(0);
  const [evId, setEvId] = useState<string | null>(null);
  const [focusedEvidenceId, setFocusedEvidenceId] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  const ev = useMemo(() => (evId ? findEvidence(c, evId) : undefined), [evId]);

  const go = useCallback((next: number) => {
    const resolved = Math.max(0, Math.min(ACTS.length - 1, next));
    setAct(resolved);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#act=${resolved + 1}`);
  }, []);

  const shiftAct = useCallback((delta: number) => {
    setAct((previous) => {
      const resolved = Math.max(0, Math.min(ACTS.length - 1, previous + delta));
      if (typeof window !== "undefined") window.history.replaceState(null, "", `#act=${resolved + 1}`);
      return resolved;
    });
  }, []);

  const resetPresentation = useCallback(() => {
    window.localStorage.removeItem(reviewStorageKey(c.caseNo));
    setEvId(null);
    setFocusedEvidenceId(null);
    setTraceOpen(false);
    setAct(0);
    window.history.replaceState(null, "", "#act=1");
  }, []);

  const openEvidence = useCallback((id: string) => {
    setFocusedEvidenceId(id);
    setEvId(id);
  }, []);

  const navigateFromEvidence = useCallback((targetAct: number) => {
    setEvId(null);
    go(targetAct);
  }, [go]);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }, []);

  useEffect(() => {
    if (!entered) return;
    const syncActFromHash = () => setAct(parseActHash(window.location.hash, ACTS.length));
    syncActFromHash();
    window.addEventListener("hashchange", syncActFromHash);
    return () => window.removeEventListener("hashchange", syncActFromHash);
  }, [entered]);

  // 键盘导航 —— 剧场式体验必须能用键盘走完
  useEffect(() => {
    if (!entered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEvId(null);
        setTraceOpen(false);
        return;
      }
      if (traceOpen || evId || document.querySelector('[aria-modal="true"]')) return;
      if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(e.key)) {
        e.preventDefault();
        shiftAct(1);
      }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        shiftAct(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entered, evId, shiftAct, traceOpen]);

  // 滚轮换幕，但做节流 —— 一次滚动只走一幕，不是连续滑动
  useEffect(() => {
    if (!entered || traceOpen || evId) return;
    let lock = false;
    const onWheel = (e: WheelEvent) => {
      if (document.querySelector('[aria-modal="true"]') || Math.abs(e.deltaY) < 24 || lock) return;
      lock = true;
      window.setTimeout(() => {
        lock = false;
      }, 900);
      shiftAct(e.deltaY > 0 ? 1 : -1);
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [entered, evId, shiftAct, traceOpen]);

  if (!entered) return <Landing onEnter={onLandingEnter ?? (() => setEntered(true))} />;

  const current = ACTS[act]!;

  return (
    <div className="theatre">
      <header className="top-bar theatre-bar">
        <button className="brand brand-sla" data-sla-wordmark onClick={() => router.push("/courtroom")} type="button">
          <span className="sla-mark">SLA</span>
          <span className="brand-copy">
            <b>硅基劳动仲裁院</b>
            <i>SILICON LABOR ARBITRATION</i>
          </span>
        </button>
        <span className="case-no">
          {c.caseNo} · {caseStatusLabel()}
        </span>
      </header>

      <nav className={`act-rail ${traceOpen ? "is-trace-mode" : ""}`}>
        <div className="rail-mode" aria-label="内容模式">
          <span className="rail-mode-label">内容视图</span>
          <div className="rail-mode-primary">
            <button className={!traceOpen ? "is-active" : ""} aria-pressed={!traceOpen} onClick={() => setTraceOpen(false)} type="button">
              案件叙事
            </button>
            <button className={traceOpen ? "is-active" : ""} aria-pressed={traceOpen} onClick={() => setTraceOpen(true)} type="button">
              技术链
            </button>
          </div>
          <div className="rail-mode-secondary">
            <button onClick={resetPresentation} type="button">重置</button>
            <button onClick={toggleFullscreen} type="button">全屏</button>
          </div>
        </div>
        {ACTS.map((a, i) => (
          <button
            key={a.id}
            className={`rail-item ${i === act ? "is-active" : ""} ${i < act ? "is-done" : ""}`}
            aria-current={i === act ? "step" : undefined}
            onClick={() => go(i)}
            type="button"
          >
            <b>{a.no}</b>
            <span>{a.zh}</span>
          </button>
        ))}
      </nav>

      {traceOpen ? <TechnicalTrace onClose={() => setTraceOpen(false)} /> : null}

      <main className="stage-area">
        {ACTS.map((a, i) => (
          <section
            key={a.id}
            className={`act scene-${a.id} ${i === act ? "is-current" : i < act ? "is-past" : "is-future"}`}
            aria-hidden={i !== act}
          >
            <div className="act-head">
              <p className="act-rubric">
                <b>{a.no}</b>
                <i>{a.en}</i>
              </p>
              <h2>{a.title}</h2>
              <p className="act-thesis">{a.thesis}</p>
            </div>
            <div className="act-body">
              {a.id === "commission" ? <ActCommission onEvidence={openEvidence} /> : null}
              {a.id === "delivery" ? <ActDelivery onEvidence={openEvidence} /> : null}
              {a.id === "chain" ? <ActChain onEvidence={openEvidence} focusedEvidenceId={focusedEvidenceId} onFocusEvidence={setFocusedEvidenceId} /> : null}
              {a.id === "ruling" ? <ActRuling onEvidence={openEvidence} onHumanReview={() => go(5)} active={i === act && !traceOpen} /> : null}
              {a.id === "arguments" ? <ActArguments onEvidence={openEvidence} focusedEvidenceId={focusedEvidenceId} onFocusEvidence={setFocusedEvidenceId} /> : null}
              {a.id === "archive" ? <ActArchive onOpenTrace={() => setTraceOpen(true)} /> : null}
            </div>
          </section>
        ))}
      </main>

      {!traceOpen ? <footer className="theatre-foot">
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
      </footer> : null}

      <Drawer ev={ev} onClose={() => setEvId(null)} onNavigate={navigateFromEvidence} />
    </div>
  );
}
