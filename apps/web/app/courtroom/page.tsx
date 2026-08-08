"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { caseRuntimeLabel, formatCaseTime, parseStoredReview, reviewStorageKey } from "../case-presentation";
import { useCase } from "../case-source";
import styles from "./courtroom.module.css";

const PROGRESS = [
  ["01", "签前模拟", "已固化"],
  ["02", "交付档案", "已固化"],
  ["03", "规则复算", "已完成"],
  ["04", "AI 多方意见", "已生成"],
  ["05", "人类复核", "待进行"],
  ["06", "链上执行", "未广播"],
] as const;

const RULE_LABELS: Record<string, string> = {
  C1: "按时交付",
  C2: "PNG 格式",
  C3: "透明背景",
  C4: "画的是一只猫",
};

const EVIDENCE_COPY: Record<string, { title: string; summary: string; detail: (deadline?: string) => string; image?: string; original?: string; imageAlt?: string }> = {
  E1: {
    title: "原始需求",
    summary: "适合儿童产品的橙色猫，PNG，透明背景。",
    detail: (deadline?: string) => `委托人要求交付一只适合儿童产品使用的橙色猫插画，背景必须透明，文件格式为 PNG，并在 ${formatCaseTime(deadline ?? "")}（北京时间）前交付。当前画面展示委托人提供的视觉参考原文件，其文件指纹已记录在案件档案中。`,
    image: "/courtroom/e1-orange-cat-display.png",
    original: "/courtroom/e1-orange-cat-reference.png",
    imageAlt: "委托人提供的橙色卡通猫视觉参考",
  },
  E2: {
    title: "实际交付",
    summary: "potato.png · 原始交付文件与指纹已固化。",
    detail: () => "原始 potato.png 已纳入案件档案：按时送达，文件格式为 PNG，含透明通道。页面展示的就是本案原始交付文件；SHA-256 文件指纹用于复核展示素材与证据记录是否一致。",
    image: "/courtroom/e2-potato-display.png",
    original: "/courtroom/e2-potato.png",
    imageAlt: "Agent 实际交付的透明背景土豆 PNG",
  },
  E3: {
    title: "Moss 签名前解释",
    summary: "拟议资金托管；争议时由规则层与人工复核接续。",
    detail: () => "Moss 在签名前向委托人说明拟议的资金托管、交付验收和争议处理路径。E3 是真实模拟后固化的签前证据，但本案未广播；它不能替代对交付主体是否为猫的人工判断。",
    image: "/courtroom/suspended-gavel.jpg",
    imageAlt: "悬停在槌座上方的法槌与案件文件",
  },
  E4: {
    title: "主 Agent 转译日志",
    summary: "产品用途约束在转译中丢失。",
    detail: () => "主 Agent 将“适合儿童产品”压缩成“儿童向配色”，没有保留产品用途约束。该日志直接支撑检方关于意图漂移的陈述。",
  },
  E5: {
    title: "工具参数与警告",
    summary: "主体相似度偏低警告未触发回退。",
    detail: () => "图像工具返回主体相似度偏低警告。插画 Agent 没有回退或请求人工确认，继续提交了交付物。",
  },
};

const ARGUMENT_LABELS = {
  prosecution: ["检方", "PROSECUTION"],
  audit: ["审计方", "AUDIT"],
  defense: ["辩方", "DEFENSE"],
} as const;

function shortAddress(value?: string) {
  if (!value) return "未部署";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function CourtroomPage() {
  const rootRef = useRef<HTMLElement>(null);
  const evidenceDialogRef = useRef<HTMLElement>(null);
  const closeEvidenceRef = useRef<HTMLButtonElement>(null);
  const { caseFile } = useCase();
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [objectionRaised, setObjectionRaised] = useState(false);
  const [expandedArgument, setExpandedArgument] = useState<string | null>(null);
  const [objectionFx, setObjectionFx] = useState(false);
  const [localReview, setLocalReview] = useState<ReturnType<typeof parseStoredReview>>(null);

  const evidence = useMemo(
    () => caseFile.evidence.find((item) => item.id === selectedEvidence) ?? null,
    [selectedEvidence],
  );

  useEffect(() => {
    const syncLocalReview = () => setLocalReview(parseStoredReview(window.localStorage.getItem(reviewStorageKey(caseFile.caseNo))));
    syncLocalReview();
    window.addEventListener("focus", syncLocalReview);
    window.addEventListener("storage", syncLocalReview);
    return () => {
      window.removeEventListener("focus", syncLocalReview);
      window.removeEventListener("storage", syncLocalReview);
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      media.add(
        {
          animate: "(prefers-reduced-motion: no-preference)",
          compact: "(max-width: 1024px)",
        },
        ({ conditions }) => {
          if (!conditions?.animate) return;

          const distance = conditions.compact ? 28 : 72;
          const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
          timeline
            .fromTo('[data-motion="backdrop"]', { autoAlpha: 0, scale: 1.06 }, { autoAlpha: 1, scale: 1, duration: 1.25 })
            .fromTo('[data-motion="header"]', { autoAlpha: 0, y: -18 }, { autoAlpha: 1, y: 0, duration: 0.52 }, 0.12)
            .fromTo('[data-motion="left"]', { autoAlpha: 0, x: -distance }, { autoAlpha: 1, x: 0, duration: 0.72 }, 0.34)
            .fromTo('[data-motion="right"]', { autoAlpha: 0, x: distance }, { autoAlpha: 1, x: 0, duration: 0.72 }, 0.34)
            .fromTo('[data-motion="argument"]', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.48, stagger: 0.18 }, 0.52)
            .fromTo('[data-motion="vacancy"]', { autoAlpha: 0, scale: 0.82 }, { autoAlpha: 1, scale: 1, duration: 0.7 }, 0.9)
            .fromTo(
              '[data-chain-hop]',
              { autoAlpha: 0.22, y: 10, scale: 0.92 },
              { autoAlpha: 1, y: 0, scale: 1, duration: 0.18, stagger: 0.31, ease: "steps(1)" },
              1.12,
            )
            .fromTo('[data-motion="evidence"]', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.48, stagger: 0.1 }, 1.62);
        },
      );
    }, root);

    return () => {
      media.revert();
      context.revert();
    };
  }, []);

  useLayoutEffect(() => {
    if (!selectedEvidence || !rootRef.current) return;
    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          '[data-evidence-overlay]',
          { autoAlpha: 0, x: selectedEvidence === "E2" ? 150 : -150, rotation: selectedEvidence === "E2" ? 4 : -4, scale: 0.86 },
          { autoAlpha: 1, x: 0, rotation: -0.6, scale: 1, duration: 0.58, ease: "back.out(1.55)" },
        );
      });
    }, rootRef.current);
    return () => {
      media.revert();
      context.revert();
    };
  }, [selectedEvidence]);

  useEffect(() => {
    if (!selectedEvidence) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeEvidenceRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedEvidence(null);
      if (event.key === "Tab" && evidenceDialogRef.current) {
        const focusable = [...evidenceDialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
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
  }, [selectedEvidence]);

  const raiseObjection = () => {
    if (objectionRaised) return;
    setObjectionRaised(true);
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    window.requestAnimationFrame(() => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .to('[data-motion-ambient]', { animationPlayState: "paused", duration: 0 }, 0)
        .to('[data-motion="court-stage"]', { scale: 1.035, duration: 0.72, ease: "power2.inOut" }, 0.1)
        .to('[data-rule-sheet]', { x: -5, duration: 0.055, yoyo: true, repeat: 5 }, 0.72)
        .fromTo('[data-pending-stamp]', { autoAlpha: 0, y: -26 }, { autoAlpha: 1, y: 0, duration: 0.62 }, 1.02);
    });
  };

  return (
    <main
      ref={rootRef}
      className={styles.courtroom}
      data-courtroom
      data-objection-state={objectionRaised ? "raised" : "idle"}
    >
      <div className={styles.backdrop} data-motion="backdrop" aria-hidden="true">
        <img src="/courtroom/courtroom-hall.jpg" alt="" />
      </div>
      <div className={styles.paperNoise} aria-hidden="true" />

      <header className={styles.institutionBar} data-motion="header">
        <Link className={styles.wordmark} href="/" data-sla-wordmark aria-label="返回硅基劳动仲裁院开屏">
          <b>SLA</b>
          <span>
            <strong>硅基劳动仲裁院</strong>
            <i>SILICON LABOR ARBITRATION</i>
          </span>
        </Link>
        <Link href="/workbench" style={{ fontSize: "0.7rem", color: "#d6cdb9", textDecoration: "none", border: "1px solid rgba(214,205,185,0.3)", borderRadius: 4, padding: "0.35rem 0.7rem", fontFamily: "var(--font-mono), monospace" }}>
          任务工作台 →
        </Link>
        <div className={styles.courtTitle}>
          <span>ARBITRATION CHAMBER · 01</span>
          <b>硅基劳动仲裁院</b>
        </div>
        <div className={styles.chainState}>
          <span className={`${styles.liveDot} ${!caseFile.onchain.confirmed ? styles.fixtureDot : ""}`} />
          <span>{caseRuntimeLabel(caseFile.onchain.confirmed)}</span>
          <code>{shortAddress(caseFile.onchain.taskEscrowAddress)}</code>
          {caseFile.isMock ? <b className={`${styles.sourceBadge} ${styles.mockBadge}`}>DEMO</b> : <b className={`${styles.sourceBadge} ${styles.hybridBadge}`}>HYBRID</b>}
        </div>
      </header>

      <section className={styles.courtGrid} data-motion="court-stage">
        <aside className={`${styles.sidePanel} ${styles.dossier}`} data-motion="left">
          <div className={styles.panelHeading}>
            <span>CASE FILE</span>
            <b>案件卷宗</b>
          </div>
          <div className={styles.caseIdentity}>
            <code>{caseFile.caseNo}</code>
            <b className={styles.caseNickname}>猫猫和土豆案</b>
            <h1>{caseFile.title}</h1>
            <p className={styles.caseSummary}>
              委托人要求一只适合儿童产品的橙色猫；Agent 按时交付了透明 PNG，但画面主体是一颗土豆。C1–C3 已满足，C4“画的是猫”进入人工复核。
            </p>
            <dl>
              <div><dt>委托人</dt><dd>{shortAddress(caseFile.client)}</dd></div>
              <div><dt>工作 Agent</dt><dd>illustrator-01</dd></div>
              <div><dt>拟议托管额</dt><dd>{caseFile.onchain.amount} MON</dd></div>
              <div><dt>状态</dt><dd className={styles.pendingText}>{localReview ? "本地复核意见已生成 · 链上未执行" : "C4 人工未决"}</dd></div>
            </dl>
          </div>
          <div className={styles.progressBlock}>
            <p>仲裁进度 <span>04 / 06</span></p>
            <ol>
              {PROGRESS.map(([no, label, state], index) => {
                const reviewRecorded = Boolean(localReview) && index === 4;
                return (
                <li key={no} className={reviewRecorded || index < 4 ? styles.doneStep : index === (localReview ? 5 : 4) ? styles.currentStep : ""}>
                  <i>{no}</i>
                  <span>{label}</span>
                  <em>{reviewRecorded ? "本地意见" : state}</em>
                </li>
              )})}
            </ol>
          </div>
          {caseFile.isMock ? (
            <p className={styles.mockNotice}>DEMO FIXTURE · 合约部署真实，本案未广播</p>
          ) : (
            <p className={styles.mockNotice}>LIVE ON-CHAIN · 状态/金额为链上真实；证据叙事为演示数据（HYBRID）</p>
          )}
        </aside>

        <section className={styles.courtStage}>
          <div className={styles.justiceSlice} aria-hidden="true">
            <img src="/courtroom/justice-crop.jpg" alt="" />
          </div>

          <div className={styles.confrontation}>
            {caseFile.aiArguments.map((argument) => {
              const [zh, en] = ARGUMENT_LABELS[argument.role];
              return (
                <article
                  key={argument.role}
                  className={`${styles.argumentCard} ${styles[argument.role]} ${expandedArgument === argument.role ? styles.expandedArgument : ""}`}
                  data-motion="argument"
                  data-argument-role={argument.role}
                >
                  <header>
                    <span>{en}</span>
                    <b>{zh}意见</b>
                  </header>
                  <p>{argument.text}</p>
                  <footer>
                    {argument.cites.map((cite) => (
                      <button key={cite} onClick={() => setSelectedEvidence(cite)} type="button">
                        [{cite}]
                      </button>
                    ))}
                    {argument.role === "defense" ? (
                      <button className={styles.objectButton} onClick={() => setObjectionFx(true)} type="button">
                        提出异议
                      </button>
                    ) : null}
                    <button className={styles.expandArgumentButton} onClick={() => setExpandedArgument((current) => current === argument.role ? null : argument.role)} type="button">
                      {expandedArgument === argument.role ? "收起全文" : "展开全文"}
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>

          <div className={styles.vacancy} data-motion="vacancy" data-motion-ambient="true">
            <span>RESPONSIBILITY BREAKPOINT</span>
            <b>归属未决</b>
            <i>REQUIRES HUMAN REVIEW</i>
          </div>

          <div className={styles.bottomConsole}>
            <section className={styles.chainPanel}>
              <header>
                <span>RESPONSIBILITY CHAIN</span>
                <b>责任链</b>
                <em>
                  <img src="/courtroom/lady-justice.png" alt="" aria-hidden="true" />
                  每一步都有理由，终点却没有责任人
                </em>
              </header>
              <ol>
                {caseFile.responsibilityChain.map((hop, index) => (
                  <li key={hop.id} data-chain-hop>
                    <i>{String(index + 1).padStart(2, "0")}</i>
                    <b>{hop.actor}</b>
                    <span>{hop.actorRole === "wallet" ? "签名前边界" : hop.intentDrift ? "意图发生偏移" : "执行记录"}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className={styles.evidenceShelf}>
              {caseFile.evidence.slice(0, 3).map((item) => {
                const display = EVIDENCE_COPY[item.id]!;
                return (
                  <button
                    key={item.id}
                    className={styles.evidenceCard}
                    data-evidence-id={item.id}
                    data-motion="evidence"
                    onClick={() => setSelectedEvidence(item.id)}
                    type="button"
                  >
                    <div className={styles.evidenceThumb} data-evidence-thumb>
                      <img src={display.image} alt={display.imageAlt ?? ""} />
                    </div>
                    <div className={styles.evidenceCardCopy}>
                      <header><span>{item.id}</span><b>{display.title}</b></header>
                      <p>{display.summary}</p>
                      <em>查看证物详情 ↗</em>
                    </div>
                  </button>
                );
              })}
            </section>
          </div>
        </section>

        <aside className={`${styles.sidePanel} ${styles.rulesPanel}`} data-motion="right" data-rule-sheet>
          <div className={styles.panelHeading}>
            <span>DETERMINISTIC RULES</span>
            <b>确定性规则 C1–C4</b>
          </div>
          <div className={styles.ruleList}>
            {caseFile.ruleResults.map((rule) => {
              const isUndecidable = rule.verdict === "undecidable";
              return (
                <button
                  key={rule.id}
                  className={isUndecidable ? styles.undecidableRule : styles.satisfiedRule}
                  data-rule-id={rule.id}
                  onClick={isUndecidable ? raiseObjection : undefined}
                  type="button"
                >
                  <i>{rule.id}</i>
                  <span>
                    <b>{RULE_LABELS[rule.id]}</b>
                    <small>{isUndecidable ? "主体责任无法由规则锁定" : "证据与规则匹配"}</small>
                  </span>
                  <em>{isUndecidable ? "待人工" : "已满足"}</em>
                </button>
              );
            })}
          </div>

          <section className={styles.reviewWindow}>
            <img src="/courtroom/suspended-gavel.jpg" alt="悬停在槌座上方的法槌与案件文件" />
            <div>
              {/* ⚠️ 原文案是「印章悬停中 / 等待无法自动裁决的条款」——说反了。
                  C4 早就判不了了，不是「等待」出现这种条款；而「印章悬停中」
                  读起来像加载状态。改成陈述当前事实：钱已经冻住，在等人。 */}
              <span>人类终审 · HUMAN REVIEW</span>
              <b>{localReview ? "复核意见已归档" : objectionRaised ? "异议已提出" : "C4 悬而未决"}</b>
              <p>
                {localReview
                  ? `${localReview.reviewer} · ${localReview.role}；链上仍未签名、未广播。`
                  : objectionRaised
                    ? "章没有落下。0.2 MON 仍被冻结，等一个人来决定。"
                    : "系统判不了「是不是一只猫」。0.2 MON 已冻结，这一步只能由人决定。"}
              </p>
            </div>
            <strong className={styles.pendingStamp} data-pending-stamp aria-hidden={!objectionRaised}>悬</strong>
          </section>

          <Link className={styles.enterCase} href="/demo">
            <span>进入案卷</span>
            <b>查看六幕证据与规则边界</b>
            <i>→</i>
          </Link>
        </aside>
      </section>

      <footer className={styles.statusRail}>
        <span>MONAD TESTNET · CHAIN 10143</span>
        <span>托管合约 {shortAddress(caseFile.onchain.taskEscrowAddress)}</span>
        <span>证据 {caseFile.evidence.length} 份 · 责任链 {caseFile.responsibilityChain.length} 跳 · {localReview ? "本地意见已生成 / 链上未执行" : "C4 未决"}</span>
      </footer>

      {/* ⚠️ 可见性直接由 React state 给内联样式。
          之前靠 CSS 的 [data-objection-state] + GSAP 的 autoAlpha 双控，
          两边抢同一个属性，表现就是「时而有时而无」。
          内联样式优先级最高，来源唯一，不会再抢。 */}
      <div
        className={styles.objectionMark}
        data-objection-mark
        aria-hidden={!objectionRaised}
        style={{
          opacity: objectionRaised ? 1 : 0,
          transform: `rotate(-7deg) scale(${objectionRaised ? 1 : 0.86})`,
        }}
      >
        <span>異議</span>
        <b>OBJECTION</b>
      </div>

      {evidence ? (
        <div className={styles.evidenceOverlay} data-evidence-overlay role="dialog" aria-modal="true" aria-label={`${evidence.id} 证物详情`}>
          <button className={styles.overlayScrim} onClick={() => setSelectedEvidence(null)} aria-label="关闭证物" type="button" />
          <article ref={evidenceDialogRef}>
            <button className={styles.closeEvidence} ref={closeEvidenceRef} onClick={() => setSelectedEvidence(null)} type="button">关闭 ×</button>
            <div className={styles.evidenceImage} data-evidence-image-id={evidence.id}>
              {EVIDENCE_COPY[evidence.id]?.image ? (
                <img
                  src={EVIDENCE_COPY[evidence.id]?.image}
                  alt={EVIDENCE_COPY[evidence.id]?.imageAlt ?? `${evidence.id} ${EVIDENCE_COPY[evidence.id]?.title}`}
                />
              ) : (
                <div className={styles.overlayImageMissing}>
                  <b>{evidence.id === "E1" ? "原始猫图素材待补" : "结构化日志证据"}</b>
                  <span>{evidence.id === "E1" ? "CAT REFERENCE · NOT PROVIDED" : "LOG RECORD · NO IMAGE REQUIRED"}</span>
                  <p>{evidence.id === "E1" ? "此处不会使用土豆图或生成图片冒充委托人的原始证物。" : "该证据以可审阅的文本记录呈现，不使用装饰图片替代日志内容。"}</p>
                </div>
              )}
              <span>{evidence.id}</span>
            </div>
            <div className={styles.evidenceText}>
              <p>EVIDENCE · {evidence.kind.replaceAll("_", " ")}</p>
              <h2>{EVIDENCE_COPY[evidence.id]?.title}</h2>
              <blockquote>{evidence.text}</blockquote>
              <p className={styles.evidenceDetail}>{EVIDENCE_COPY[evidence.id]?.detail(caseFile.onchain.deadline)}</p>
              {EVIDENCE_COPY[evidence.id]?.original ? <a className={styles.downloadOriginal} href={EVIDENCE_COPY[evidence.id]?.original} download>下载原始证物文件 ↓</a> : null}
              <dl>
                <div><dt>时间</dt><dd>{formatCaseTime(evidence.ts)}（北京时间）</dd></div>
                <div><dt>来源</dt><dd>{evidence.source}</dd></div>
                <div><dt>{evidence.kind === "requirement_hash" ? "条款承诺" : evidence.asset ? "文件指纹" : "校验"}</dt><dd><code>{evidence.hash ? `${evidence.hash.slice(0, 22)}…` : "链下日志 · 未声称上链"}</code></dd></div>
                {evidence.asset && evidence.asset.sha256 !== evidence.hash ? (
                  <div><dt>文件指纹</dt><dd><code>{evidence.asset.sha256.slice(0, 22)}…</code></dd></div>
                ) : null}
              </dl>
            </div>
          </article>
        </div>
      ) : null}

      <ObjectionBurst
        show={objectionFx}
        onDone={() => {
          setObjectionFx(false);
          // 特效收场之后，戳才落到辩方卡下方——先爆，再定案
          setObjectionRaised(true);
        }}
      />
    </main>
  );
}

/* ══════════════════════════════════════════════════════════
   「异议」特效
   ══════════════════════════════════════════════════════════

   参考逆转裁判的「異議あり！」，只偷剪辑语法不偷画风
   （docs/03 §十二：它的美学内核是「一定有答案」，我们是「判不了」，
    视觉先于台词被接收，画风照搬会和主张正面打架）。

     偷   硬切（无渐入）· 放射线 · 过冲回弹
     不偷 漫画速度线 · 动漫立绘 · 对话气泡

   ⚠️ 不做全屏。全屏会盖掉法庭和三份证词——而「异议」是**对着某一方**
   提出的，盖掉对方等于抽走了语境。所以只在画面中央爆开，
   比中间那张审计卡稍大一圈（20rem → 26rem）。
   ══════════════════════════════════════════════════════════ */

function ObjectionBurst({ show, onDone }: { show: boolean; onDone: () => void }) {
  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(onDone, 1150);
    return () => window.clearTimeout(t);
  }, [show, onDone]);

  if (!show) return null;
  return (
    <div className={styles.objectionFx} aria-hidden>
      <span className={styles.objRays} />
      <span className={styles.objBurst} />
      <span className={styles.objWord}>
        <em>异议</em>
        <i>OBJECTION</i>
      </span>
    </div>
  );
}
