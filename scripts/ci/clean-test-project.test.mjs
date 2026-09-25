import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageNames = ["quality-guard", "code-explorer", "fossil", "knowledge-base"];
const npmCli = [
  process.env.npm_execpath,
  path.resolve(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  path.resolve(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
].find((candidate) => typeof candidate === "string" && existsSync(candidate));

assert.ok(npmCli, "npm CLI could not be located next to the active Node.js runtime");

function compiledTests(root) {
  if (!existsSync(root)) return [];
  const tests = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) tests.push(...compiledTests(entryPath));
    else if (entry.name.endsWith(".test.js")) tests.push(entryPath);
  }
  return tests;
}

test("build:test removes stale output in every test workspace", () => {
  for (const packageName of packageNames) {
    const packageRoot = path.join(workspaceRoot, "packages", packageName);
    const testRoot = path.join(packageRoot, "dist-test");
    const stalePath = path.join(testRoot, "tests", "__stale-cleanup-probe__.test.js");
    mkdirSync(path.dirname(stalePath), { recursive: true });
    writeFileSync(stalePath, "export const stale = true;\n");

    try {
      execFileSync(process.execPath, [npmCli, "run", "build:test", "-w", `packages/${packageName}`], {
        cwd: workspaceRoot,
        stdio: "inherit",
      });
      assert.equal(existsSync(stalePath), false, `${packageName} retained stale test output`);
      assert.ok(compiledTests(path.join(testRoot, "tests")).length > 0, `${packageName} emitted no tests`);
    } finally {
      rmSync(stalePath, { force: true });
    }
  }
});
