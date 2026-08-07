import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("./courtroom/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./courtroom/courtroom.module.css", import.meta.url), "utf8");

test("异议特效由辩方卡触发，戳落在辩方卡下方，可见性只有一个来源", () => {
  // 触发点在辩方意见卡，不是规则表
  assert.match(page, /argument\.role === "defense"[\s\S]{0,200}提出异议/);

  // 特效非全屏：只占中央一块，比审计卡（20rem）稍大
  assert.match(css, /\.objectionFx\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /\.objectionFx\s*\{[^}]*width:\s*26rem/s);

  // ⚠️ 这条锁的是一个真实的 bug：
  // 戳的可见性曾同时被 CSS 的 [data-objection-state]、GSAP 的 autoAlpha
  // 和 visibility 三方控制，互相抢，表现就是「时而有时而无」。
  // 现在只由 React state 写内联 opacity，来源唯一。
  assert.match(page, /data-objection-mark[\s\S]{0,220}opacity:\s*objectionRaised\s*\?\s*1\s*:\s*0/);
  assert.doesNotMatch(page, /\[data-objection-mark\][\s\S]{0,80}autoAlpha/);
  assert.doesNotMatch(css, /\.objectionMark\s*\{[^}]*visibility:\s*hidden/s);

  // 戳挪出了画面中心（原先 fixed 居中，正好压住审计卡）
  assert.doesNotMatch(css, /\.objectionMark\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.objectionMark\s*\{[^}]*top:\s*46%/s);

  // 先爆特效，再落戳
  assert.match(page, /onDone=\{\(\)\s*=>\s*\{[\s\S]{0,200}setObjectionRaised\(true\)/);
});
