import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BIOME = JSON.parse(readFileSync(join(ROOT, "biome.json"), "utf8"));
const BIOME_CLI = join(ROOT, "node_modules", "@biomejs", "biome", "bin", "biome");
const NODE_MODULES_DIAGNOSTIC = /noNodejsModules/;

function writeFixture(root, relativePath, content) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function runBiome(root, relativePath) {
  return spawnSync(
    process.execPath,
    [BIOME_CLI, "lint", relativePath, "--max-diagnostics=none", "--no-errors-on-unmatched"],
    { cwd: root, encoding: "utf8" },
  );
}

test("Biome exempts the Node build helper but keeps the browser boundary covered", () => {
  const override = BIOME.overrides.find(({ includes = [] }) =>
    includes.includes("packages/code-explorer/scripts/build-browser.mjs"),
  );
  assert.equal(override?.linter?.rules?.correctness?.noNodejsModules, "off");
  assert.notEqual(BIOME.linter.rules.correctness?.noNodejsModules, "off");

  const parent = mkdtempSync(join(tmpdir(), "biome-boundary-"));
  const root = join(parent, "repo");
  mkdirSync(root);
  try {
    cpSync(join(ROOT, "biome.json"), join(root, "biome.json"));
    writeFixture(root, "packages/code-explorer/scripts/build-browser.mjs", 'import fs from "node:fs";\n');
    writeFixture(root, "packages/code-explorer/src/browser/biome-boundary.ts", 'import fs from "node:fs";\n');

    const nodeScript = runBiome(root, "packages/code-explorer/scripts/build-browser.mjs");
    const browserSource = runBiome(root, "packages/code-explorer/src/browser/biome-boundary.ts");
    assert.doesNotMatch(`${nodeScript.stdout}${nodeScript.stderr}`, NODE_MODULES_DIAGNOSTIC);
    assert.match(`${browserSource.stdout}${browserSource.stderr}`, NODE_MODULES_DIAGNOSTIC);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
