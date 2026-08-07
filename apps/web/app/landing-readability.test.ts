import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const experience = readFileSync(new URL("./experience.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

test("the landing page uses the warmer gallery, readable comparison copy, and brown seal", () => {
  assert.match(experience, /查看案件\s*猫猫和土豆案/);
  assert.match(css, /--gallery-black:\s*#2a221c/);
  assert.match(css, /--micro-copy:\s*0\.68rem/);
  assert.match(css, /\.landing \.void-ring\s*\{[^}]*border[^;}]*var\(--gallery-brown\)/s);
  assert.match(css, /\.positioning-contrast i\s*\{[^}]*font-size:\s*0\.78rem/s);
  assert.match(css, /\.landing \.positioning-contrast\s*\{[^}]*max-width:\s*33rem/s);
  assert.match(css, /\.landing \.pitch\s*\{[^}]*width:\s*min\(35rem,\s*43vw\)/s);
  assert.match(css, /\.landing :where\(\.exhibit-panel p, \.hang-tag\)\s*\{[^}]*font-size:\s*0\.64rem/s);
  assert.match(css, /\.theatre :where\(\.responsibility-card-seq,[^}]*font-size:\s*0\.62rem/s);
});
