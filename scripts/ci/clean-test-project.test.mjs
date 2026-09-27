import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanTestProject } from "./clean-test-project.mjs";

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

test("cleanup is idempotent and preserves production, source, and unrelated output", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "clean-test-project-"));
  const productionPath = path.join(root, "dist", "production.js");
  const sourcePath = path.join(root, "tests", "source.test.ts");
  const unrelatedPath = path.join(root, "other", "output.txt");
  mkdirSync(path.dirname(productionPath), { recursive: true });
  mkdirSync(path.dirname(sourcePath), { recursive: true });
  mkdirSync(path.dirname(unrelatedPath), { recursive: true });
  writeFileSync(productionPath, "production\n");
  writeFileSync(sourcePath, "source\n");
  writeFileSync(unrelatedPath, "unrelated\n");
  mkdirSync(path.join(root, "dist-test"), { recursive: true });
  writeFileSync(path.join(root, "dist-test", "stale.test.js"), "stale\n");

  try {
    await cleanTestProject(root);
    await cleanTestProject(root);
    assert.equal(existsSync(path.join(root, "dist-test")), false);
    assert.equal(readFileSync(productionPath, "utf8"), "production\n");
    assert.equal(readFileSync(sourcePath, "utf8"), "source\n");
    assert.equal(readFileSync(unrelatedPath, "utf8"), "unrelated\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup propagates filesystem failures", async () => {
  const failure = new Error("cleanup failed");
  await assert.rejects(
    cleanTestProject("C:\\fixture", () => {
      throw failure;
    }),
    failure,
  );
});
