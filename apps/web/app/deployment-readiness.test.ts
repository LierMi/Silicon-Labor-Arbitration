import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };

test("the web build prepares Moss workspace packages before Next.js", () => {
  assert.equal(packageJson.scripts?.prebuild, "pnpm --dir ../.. build:moss");
});
