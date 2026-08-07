# Courtroom Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent `/courtroom` overview between the explosion-gallery landing and the existing six-act case experience.

**Architecture:** Keep the current landing and six-act theatre intact, but expose the theatre as a reusable client component with an `initialEntered` option. Add a dedicated client page and CSS module for the courtroom, using the domain fixture as the single data source and GSAP for staged motion. Copy only selected user-provided assets into a route-specific public folder.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, CSS Modules, GSAP 3, `@sla/domain`.

## Global Constraints

- Follow `docs/03-视觉灵感与3D方案.md`: archive skin, game pacing.
- Use Ace Attorney editing syntax, not its anime art style.
- Route sequence is `/` → `/courtroom` → `/demo`.
- Do not generate replacement judicial imagery.
- SLA wordmark must show `SLA`, `硅基劳动仲裁院`, and `SILICON LABOR ARBITRATION`.
- C4 stays `undecidable`; never rewrite it as a verdict.
- Respect `prefers-reduced-motion`.
- Do not stage, commit, or push Git changes unless the user asks.

---

### Task 1: Route contract and reusable existing experience

**Files:**
- Create: `apps/web/app/experience.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/demo/page.tsx`
- Create: `apps/web/app/courtroom/page.tsx`

**Interfaces:**
- Produces: `ArbitrationExperience({ initialEntered, onLandingEnter })` from `experience.tsx`.
- Produces: `/courtroom` and `/demo` routes with distinct first screens.

- [ ] **Step 1: Verify the route contract fails before implementation**

Run:

```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:3999/courtroom
```

Expected: `404`.

- [ ] **Step 2: Extract the existing page controller without changing the six acts**

Move the current controller into `experience.tsx` and expose:

```tsx
export function ArbitrationExperience({
  initialEntered = false,
  onLandingEnter,
}: {
  initialEntered?: boolean;
  onLandingEnter?: () => void;
}) {
  const [entered, setEntered] = useState(initialEntered);
  // existing act, evidence, keyboard, wheel, and theatre code remains here
}
```

The landing callback uses `onLandingEnter ?? (() => setEntered(true))`.

- [ ] **Step 3: Make root and demo choose explicit destinations**

Root page uses `useRouter()` and sends the landing CTA to `/courtroom`. Demo renders `<ArbitrationExperience initialEntered />` so `/demo` opens directly in the six-act theatre.

- [ ] **Step 4: Add a temporary semantic courtroom shell**

Create a page that renders a `main` with `data-courtroom`, a heading, and a link to `/demo`. This makes the route testable before visual work.

- [ ] **Step 5: Verify route and type contracts**

Run:

```bash
pnpm --filter web typecheck
pnpm --filter web build
```

Expected: exit code `0` and routes include `/courtroom` and `/demo`.

---

### Task 2: Courtroom assets and static composition

**Files:**
- Create: `apps/web/public/courtroom/courtroom-hall.jpg`
- Create: `apps/web/public/courtroom/suspended-gavel.jpg`
- Create: `apps/web/public/courtroom/evidence-intent.jpg`
- Create: `apps/web/public/courtroom/evidence-delivery.jpg`
- Create: `apps/web/app/courtroom/courtroom.module.css`
- Modify: `apps/web/app/courtroom/page.tsx`

**Interfaces:**
- Consumes: `freshPotatoCase()`.
- Produces: semantic hooks `[data-courtroom]`, `[data-rule-id]`, `[data-evidence-id]`, `[data-chain-hop]`, and `[data-sla-wordmark]`.

- [ ] **Step 1: Establish the static visual contract**

Before implementing the full composition, verify the temporary page is missing required hooks:

```js
{
  wordmark: document.querySelectorAll('[data-sla-wordmark]').length,
  rules: document.querySelectorAll('[data-rule-id]').length,
  evidence: document.querySelectorAll('[data-evidence-id]').length,
  chain: document.querySelectorAll('[data-chain-hop]').length
}
```

Expected before implementation: not equal to `{ wordmark: 1, rules: 4, evidence: 3, chain: 5 }`.

- [ ] **Step 2: Copy the selected user assets without transforming them**

Copy the approved files from `/Users/emily/Downloads/硅基 素材/` into `apps/web/public/courtroom/` with descriptive names. Do not crop, regenerate, or remove backgrounds.

- [ ] **Step 3: Build the top institution bar and SLA wordmark**

Render `SLA`, `硅基劳动仲裁院`, `SILICON LABOR ARBITRATION`, the case number, Monad Testnet, and mock-data disclosure.

- [ ] **Step 4: Build the asymmetric courtroom composition**

Use the courtroom image as a darkened full-bleed background. Layer:

```text
left dossier | prosecution document | central audit / unassigned seat | defense document | right rules
bottom responsibility chain + E1/E2/E3 + enter-case control
```

No robot portraits or decorative complete scales.

- [ ] **Step 5: Render data from the domain fixture**

Map `c.ruleResults`, `c.responsibilityChain`, and `c.evidence.slice(0, 3)` instead of duplicating status data. Keep `C4` visually distinct using its real `undecidable` value.

- [ ] **Step 6: Verify semantic counts**

Expected:

```json
{ "wordmark": 1, "rules": 4, "evidence": 3, "chain": 5 }
```

---

### Task 3: Ace Attorney pacing without anime styling

**Files:**
- Modify: `apps/web/app/courtroom/page.tsx`
- Modify: `apps/web/app/courtroom/courtroom.module.css`

**Interfaces:**
- Produces: `openEvidence(id: string)` and `raiseObjection()` interactions.
- Produces: `[data-evidence-overlay]` and `[data-objection-state]` states.

- [ ] **Step 1: Define failing interaction checks**

Expected before implementation:

```text
click E2 → exactly one visible evidence overlay
press Escape → evidence overlay closes
click C4 → objection state becomes "raised"
```

- [ ] **Step 2: Implement the entrance timeline**

Use a scoped `gsap.context()` timeline:

```text
background reveal → left/right confrontation panels → central audit seat → five chain hops with 0.3 s pauses
```

Animate only transforms and opacity.

- [ ] **Step 3: Implement evidence throw-in**

Clicking E1/E2/E3 sets the selected evidence and animates its overlay from the corresponding side with overshoot. Escape and the close control dismiss it.

- [ ] **Step 4: Implement the C4 objection beat**

Clicking C4 pauses ambient motion, pushes the courtroom in, lands a red `异议` mark, briefly shakes the document plane, then reveals `待人工复核` and a suspended-stamp state.

- [ ] **Step 5: Add reduced-motion behavior**

Use `gsap.matchMedia()` and CSS media queries. Reduced-motion users receive immediate state changes and fades only.

- [ ] **Step 6: Verify interaction checks**

Run the three checks from Step 1 and confirm all pass.

---

### Task 4: Responsive composition and final verification

**Files:**
- Modify: `apps/web/app/courtroom/courtroom.module.css`
- Modify: `apps/web/app/courtroom/page.tsx`

**Interfaces:**
- Produces: usable desktop, tablet, and mobile layouts.

- [ ] **Step 1: Implement responsive layout**

- Desktop: one-screen courtroom with opposing side panels.
- Tablet: side panels compress into top/bottom document rails.
- Mobile: vertical document sequence; no scaled-down desktop dashboard.

- [ ] **Step 2: Verify navigation**

Check:

```text
/ landing CTA → /courtroom
/courtroom primary CTA → /demo
/demo opens six-act theatre directly
```

- [ ] **Step 3: Verify desktop and mobile visual contracts**

Inspect at `1280×720`, `1672×941`, and `390×844`. Confirm no horizontal overflow, readable controls, and visible C4 status.

- [ ] **Step 4: Run full build verification**

Run:

```bash
pnpm --filter web typecheck
pnpm --filter web build
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 5: Restart the production server and perform browser regression**

Restart the exact process listening on port `3999`, reload the final production build, verify console errors are empty, then leave `/courtroom` open as the deliverable preview.
