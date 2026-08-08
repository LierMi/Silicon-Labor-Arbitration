import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appRoot = new URL("..", import.meta.url);

test("the responsibility scene is a two-dimensional board with no Three.js runtime", async () => {
  const [packageJson, experience] = await Promise.all([
    readFile(new URL("package.json", appRoot), "utf8"),
    readFile(new URL("app/experience.tsx", appRoot), "utf8"),
  ]);

  const dependencies = JSON.parse(packageJson).dependencies as Record<string, string>;
  assert.equal(dependencies["@react-three/fiber"], undefined);
  assert.equal(dependencies["@react-three/drei"], undefined);
  assert.equal(dependencies.three, undefined);
  assert.match(experience, /ResponsibilityChainBoard/);
  assert.doesNotMatch(experience, /ResponsibilityChain3D/);
});

test("responsibility cards use click-driven details, consistent orange frames, and readable type", async () => {
  const [board, experience, css] = await Promise.all([
    readFile(new URL("app/responsibility-chain-board.tsx", appRoot), "utf8"),
    readFile(new URL("app/experience.tsx", appRoot), "utf8"),
    readFile(new URL("app/globals.css", appRoot), "utf8"),
  ]);

  assert.doesNotMatch(board, /onMouseEnter=\{\(\) => onActiveHop\(hop\.id\)\}/);
  assert.match(board, /aria-pressed=\{active\}/);
  assert.match(board, /aria-controls="responsibility-hop-detail"/);
  assert.match(experience, /id="responsibility-hop-detail"/);
  assert.match(experience, /onMouseLeave=\{\(\) => onFocusEvidence\(null\)\}/);

  assert.match(css, /\.responsibility-card\s*\{[^}]*--frame:\s*rgba\(217,\s*107,\s*43,\s*0\.76\)/s);
  assert.match(css, /\.responsibility-card\s*\{[^}]*opacity:\s*1/s);
  assert.doesNotMatch(css, /\.responsibility-card\.has-drift\s*\{[^}]*--frame:/s);
  assert.match(css, /--chain-micro:\s*0\.7rem/);
  assert.match(css, /\.responsibility-card-main:focus-visible\s*\{[^}]*outline:\s*2px solid rgba\(217,\s*107,\s*43,\s*0\.92\)/s);
  assert.match(css, /\.responsibility-card dl div:nth-child\(n \+ 2\)\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.scene-chain:has\(\.act-chain\.is-board\) \.hop-detail\s*\{[^}]*max-height:\s*11rem/s);
});

test("only pointer hover raises a responsibility card", async () => {
  const css = await readFile(new URL("app/globals.css", appRoot), "utf8");

  assert.match(
    css,
    /\.responsibility-card:hover\s*\{[^}]*transform:\s*translateY\(-0\.7rem\) scale\(1\.055\)/s,
  );
  assert.doesNotMatch(
    css,
    /\.responsibility-card:focus-within,\s*\.responsibility-card\.is-active\s*\{[^}]*transform:/s,
  );
});
