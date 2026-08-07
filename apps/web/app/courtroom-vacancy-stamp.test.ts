import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("./courtroom/courtroom.module.css", import.meta.url), "utf8");

test("the courtroom unresolved responsibility marker is a red double-ring seal", () => {
  assert.match(css, /\.vacancy\s*\{[^}]*--stamp-red:/s);
  assert.match(css, /\.vacancy\s*\{[^}]*border-radius:\s*50%/s);
  assert.match(css, /\.vacancy::before\s*\{[^}]*border:[^;}]*var\(--stamp-red\)/s);
});
