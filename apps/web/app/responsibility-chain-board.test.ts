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
