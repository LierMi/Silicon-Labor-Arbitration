"use client";

import type { CSSProperties } from "react";
import { ACTOR_ROLE_LABEL } from "@sla/domain";
import type { Case } from "@sla/domain";

type ResponsibilityHop = Case["responsibilityChain"][number];

export type ResponsibilityChainBoardProps = {
  hops: Case["responsibilityChain"];
  activeHopId: string;
  focusedEvidenceId: string | null;
  onActiveHop: (id: string) => void;
  onOpenEvidence: (id: string) => void;
};

export function ResponsibilityChainBoard({
  hops,
  activeHopId,
  focusedEvidenceId,
  onActiveHop,
  onOpenEvidence,
}: ResponsibilityChainBoardProps) {
  return (
    <section className="responsibility-board" aria-label="责任链二维证据板">
      <header className="responsibility-board-head">
        <div><span>RESPONSIBILITY TRACE</span><b>责任在传递中变薄</b></div>
        <em>悬停放大 · 点击节点查看</em>
      </header>

      <div className="responsibility-board-track">
        {hops.map((hop, index) => {
          const active = hop.id === activeHopId;
          const evidenceLinked = focusedEvidenceId ? hop.evidenceRefs.includes(focusedEvidenceId) : false;
          const evidenceDimmed = Boolean(focusedEvidenceId && !evidenceLinked);
          return (
            <article
              key={hop.id}
              className={`responsibility-card ${active ? "is-active" : ""} ${hop.intentDrift ? "has-drift" : ""} ${evidenceLinked ? "is-evidence-linked" : ""} ${evidenceDimmed ? "is-evidence-dimmed" : ""}`}
              style={{ "--card-index": index } as CSSProperties}
              onMouseEnter={() => onActiveHop(hop.id)}
            >
              <button
                className="responsibility-card-main"
                onClick={() => onActiveHop(hop.id)}
                onFocus={() => onActiveHop(hop.id)}
                type="button"
              >
                <span className="responsibility-card-seq">0{index + 1} / RESPONSIBILITY TRACE</span>
                <b>{hop.id}</b>
                <strong>{hop.actor}</strong>
                <span className="responsibility-card-role">{ACTOR_ROLE_LABEL[hop.actorRole]}</span>
                <dl>
                  <div><dt>拿到了什么权限</dt><dd>{hop.authority}</dd></div>
                  <div><dt>做了什么</dt><dd>{hop.action}</dd></div>
                </dl>
                {hop.intentDrift ? <i>{hop.intentDrift}</i> : null}
              </button>
              <div className="responsibility-card-evidence">
                {hop.evidenceRefs.length ? hop.evidenceRefs.map((evidenceId) => (
                  <button key={evidenceId} onClick={() => onOpenEvidence(evidenceId)} type="button">
                    {evidenceId}
                  </button>
                )) : <span>NO DIRECT EVIDENCE</span>}
              </div>
              {index < hops.length - 1 ? <span className="responsibility-connector" aria-hidden="true">→</span> : null}
              {index === hops.length - 2 ? <em className="responsibility-break">CHAIN BREAK</em> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
