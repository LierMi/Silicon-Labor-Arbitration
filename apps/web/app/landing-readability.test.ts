import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const experience = readFileSync(new URL("./experience.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

test("the landing page uses the warmer gallery, readable copy, and a crimson unassigned seal", () => {
  assert.match(experience, /查看案件\s*猫猫和土豆案/);
  assert.match(css, /--gallery-black:\s*#2a221c/);
  assert.match(css, /--micro-copy:\s*0\.68rem/);
  // 归属未决是这一屏的结论，改用深红——全场只有它和印章配得上这个颜色
  assert.match(css, /\.landing \.void-ring\s*\{[^}]*border:\s*2px solid rgba\(160,\s*34,\s*26/s);
  assert.match(css, /\.landing \.void-copy b\s*\{[^}]*color:\s*#c0392b/s);
  assert.match(css, /\.positioning-contrast i\s*\{[^}]*font-size:\s*0\.78rem/s);
  assert.match(css, /\.landing \.positioning-contrast\s*\{[^}]*max-width:\s*33rem/s);
  assert.match(css, /\.landing \.pitch\s*\{[^}]*width:\s*min\(35rem,\s*43vw\)/s);
  // 0.64rem 投屏读不出来，而这三块正是要评委看清的内容
  assert.match(css, /\.landing \.exhibit-panel p\s*\{[^}]*font-size:\s*0\.83rem/s);
  assert.match(css, /\.landing \.hang-tag\s*\{[^}]*font-size:\s*0\.72rem/s);
  assert.match(css, /\.theatre :where\(\.responsibility-card-seq,[^}]*font-size:\s*0\.7rem/s);
});

test("the landing evidence system uses orange frames, clears the seal, and fades softly into the gallery", () => {
  assert.match(experience, /id:\s*"E3"[^\n]*y:\s*66\.5[^\n]*wire:\s*66\.5/);
  assert.match(css, /--gallery-frame-rgb:\s*217,\s*107,\s*43/);
  assert.match(
    css,
    /\.landing \.hang\[data-frame-style="glass"\] \.exhibit-panel\s*\{[^}]*border:\s*1px solid rgba\(var\(--gallery-frame-rgb\),\s*0\.72\)/s,
  );
  assert.match(
    css,
    /\.landing \.hang-tag\[data-tag-id="params"\]\s*\{[^}]*border:\s*1px solid rgba\(var\(--gallery-frame-rgb\),\s*0\.7\)/s,
  );
  assert.match(css, /\.landing \.enter-link\s*\{[^}]*border-color:\s*rgba\(var\(--gallery-frame-rgb\),\s*0\.48\)/s);
  assert.match(css, /\.landing \.positioning-contrast\s*\{[^}]*border-color:\s*rgba\(var\(--gallery-frame-rgb\),\s*0\.24\)/s);
  assert.match(css, /radial-gradient\(ellipse 78% 125% at -10% 48%/);
});
