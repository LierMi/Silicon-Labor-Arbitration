import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

test("the six narrative scenes add 2px to small copy with a 13px floor", () => {
  const match = css.match(
    /\/\* 案件叙事 01–06：非标题小字统一 \+2px，且不低于 13px。 \*\/([\s\S]*?)\/\* 案件叙事字号覆盖结束 \*\//,
  );

  assert.ok(match, "the narrative-only readability overrides should exist");
  const rules = match[1];

  // 小于 11px 的微型说明统一抬到可读下限。
  assert.match(rules, /\.act \.act-rubric i[\s\S]*?font-size:\s*13px/);
  assert.match(rules, /\.act \.hop-detail dt[\s\S]*?font-size:\s*13px/);
  assert.match(rules, /\.act \.archive-conclusions span[\s\S]*?font-size:\s*13px/);

  // 其余字号保留原层级，只增加 2px。
  assert.match(rules, /\.act \.responsibility-card dd[\s\S]*?font-size:\s*14\.48px/);
  assert.match(rules, /\.act \.aside[\s\S]*?font-size:\s*15\.44px/);
  assert.match(rules, /\.act \.act-thesis[\s\S]*?font-size:\s*16\.08px/);
  assert.match(rules, /\.act blockquote[\s\S]*?font-size:\s*17\.68px/);

  // 标题不在本次覆盖范围内。
  assert.doesNotMatch(rules, /h[1-6]/);
});

test("the delivery potato clears the preview label without changing the evidence asset", () => {
  assert.match(
    css,
    /\.artifact img\s*\{[^}]*object-fit:\s*contain;[^}]*padding:\s*7% 1\.5rem 1\.2rem;/s,
  );
});
