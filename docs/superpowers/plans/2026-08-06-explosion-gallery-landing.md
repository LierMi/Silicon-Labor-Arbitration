# Explosion Gallery Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current flat dark-room landing visuals with a cinematic paused-explosion gallery while preserving every existing visible string and the existing six-act transition.

**Architecture:** A generated text-free 16:9 gallery plate supplies photoreal spatial depth. Existing React-rendered content stays live above it; focused DOM layers provide acrylic evidence boards, depth accents, the responsibility void, and progressive enhancement via GSAP. CSS remains a complete static fallback and owns responsive/reduced-motion behavior.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.6, CSS, GSAP 3, generated WebP/JPEG asset, in-app browser verification.

## Global Constraints

- Preserve all current visible landing copy byte-for-byte.
- Do not change case data, the six-act experience, or the current `onEnter` outcome.
- Do not add React Three Fiber or another 3D engine.
- Keep a readable CSS-only/static fallback.
- Validate 1280 × 720 and 1672 × 941 plus a narrow mobile viewport.
- Do not commit, stage, push, or open a pull request; the user did not authorize Git actions.

---

### Task 1: Lock Copy and Create the Gallery Plate

**Files:**
- Create: `apps/web/public/images/explosion-gallery.webp`
- Create: `apps/web/public/images/explosion-gallery-fallback.jpg`
- Inspect: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: the two user-provided 1672 × 941 reference PNGs.
- Produces: a text-free background plate addressed as `/images/explosion-gallery.webp` with fallback `/images/explosion-gallery-fallback.jpg`.

- [ ] **Step 1: Capture the visible-copy baseline**

Use the existing localhost page DOM snapshot and record the landing strings: brand, case number, both enter buttons, E1/E2/E3 content, four hanging labels, responsibility void, headline, two body paragraphs, and three footer values.

- [ ] **Step 2: Generate the text-free scene**

Generate a 16:9 black-box gallery image using both references. Require: bare central bulb, radial charred debris, visible empty center, floor/wall shadows, quiet near-black left third, no letters, labels, signs, UI panels, logos, people, or readable text.

- [ ] **Step 3: Prepare web assets**

Convert the selected output to a quality-balanced WebP and JPEG fallback at 1920 × 1080. Confirm both files load and the left third remains readable under bone-white text.

- [ ] **Step 4: Verify artifact dimensions**

Run: `sips -g pixelWidth -g pixelHeight apps/web/public/images/explosion-gallery.webp apps/web/public/images/explosion-gallery-fallback.jpg`

Expected: both assets report `1920 × 1080`.

### Task 2: Implement the Cinematic DOM and GSAP Layers

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `/images/explosion-gallery.webp`, the existing `HANGING`, `TAGS`, evidence lookup, `onEnter`, and current landing strings.
- Produces: `Landing` with `.gallery-plate`, `.gallery-atmosphere`, `.evidence-rig`, `.responsibility-void`, GSAP entrance/exit timelines, and CSS fallback states.

- [ ] **Step 1: Add the animation dependency**

Run: `pnpm --filter @sla/web add gsap`

Expected: `gsap` appears under `apps/web/package.json` dependencies and the workspace lockfile updates.

- [ ] **Step 2: Establish the failing visual assertions**

Before implementation, query localhost for `.gallery-plate`, `[data-evidence-id="E1"]`, and `.responsibility-void`.

Expected: counts are `0`, proving the new visual contract is absent.

- [ ] **Step 3: Add stable DOM hooks without changing copy**

Refactor only the landing JSX to add a root `ref`, gallery plate/atmosphere layers, `data-depth` hooks, `data-evidence-id` attributes, keyboard focus on evidence panels, decorative `aria-hidden` values, and `.responsibility-void`. Keep every existing text node unchanged.

- [ ] **Step 4: Add the GSAP lifecycle**

Inside `Landing`, initialize one `gsap.context()` and `gsap.matchMedia()` in `useLayoutEffect`. Build a ~1.8s intro timeline, pointer-driven `gsap.quickTo()` depth movement, evidence focus/hover emphasis, and the existing ~620ms exit. Revert context, matchMedia, and quick setters on cleanup. Under `(prefers-reduced-motion: reduce)`, set final states without motion.

- [ ] **Step 5: Replace the landing visual CSS**

Use the generated plate with layered gradients, grain, vignette, cool acrylic surfaces, yellow evidence tags, charred near-field debris, stronger floor shadow, and a quiet left text zone. Keep the existing non-landing act styles intact. Add explicit desktop, tablet, mobile, and reduced-motion rules.

- [ ] **Step 6: Run type and build checks**

Run: `pnpm --filter @sla/web typecheck && pnpm --filter @sla/web build`

Expected: both commands exit `0`.

### Task 3: Visual Regression and Interaction Verification

**Files:**
- Modify only if verification exposes a defect: `apps/web/app/page.tsx`, `apps/web/app/globals.css`

**Interfaces:**
- Consumes: the implemented localhost landing page.
- Produces: verified desktop/mobile layout, copy equality, working transition, reduced-motion behavior, and a clean console.

- [ ] **Step 1: Assert the new visual contract**

Query localhost for `.gallery-plate`, `[data-evidence-id="E1"]`, `[data-evidence-id="E2"]`, `[data-evidence-id="E3"]`, and `.responsibility-void`.

Expected: counts are `1, 1, 1, 1, 1`.

- [ ] **Step 2: Compare visible copy**

Capture a fresh DOM snapshot and compare it against Task 1. Expected: every baseline string is present exactly once in the same semantic region; no generated-image text is visible.

- [ ] **Step 3: Inspect 1280 × 720**

Capture a screenshot after the intro settles. Confirm: left copy is unobstructed; bulb, debris ring, E1/E2/E3, and center void are legible; no horizontal overflow; both enter actions remain visible.

- [ ] **Step 4: Inspect 1672 × 941 and mobile**

Repeat at 1672 × 941 and a narrow viewport. Confirm the desktop composition expands without dead zones and mobile hides secondary debris/tags rather than shrinking the desktop scene.

- [ ] **Step 5: Verify interaction and transition**

Focus and hover evidence panels, check emphasis state, then activate the primary enter button. Confirm the existing act-one experience appears and keyboard navigation still works.

- [ ] **Step 6: Check reduced motion and console**

Emulate reduced motion, reload, and confirm the landing reaches its complete static state without drift or explosion. Read browser logs and require no new errors.

- [ ] **Step 7: Run final verification**

Run: `pnpm --filter @sla/web typecheck && pnpm --filter @sla/web build && git diff --check`

Expected: all commands exit `0`; only intended landing assets, source, dependency lock, design spec, and plan are changed.
