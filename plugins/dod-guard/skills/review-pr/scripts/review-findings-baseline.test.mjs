// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("review-findings.mjs", import.meta.url));
// The repository's own quality-guard stands in for the installed plugin.
const QUALITY_GUARD = fileURLToPath(new URL("../../../../../packages/quality-guard", import.meta.url));
const OLD_LINES = 130;
const NEW_LINES = 140;
const USAGE_EXIT = 3;
const SHA_LENGTH = 40;

const lines = (count) =>
  `${Array.from({ length: count }, (_, index) => `export const v${index} = ${index};`).join("\n")}\n`;

// Helpers throw rather than assert, so every assertion sits in a test.
function succeeded(result, what) {
  if (result.status !== 0) {
    throw new Error(`${what} failed (${result.status}): ${result.stderr}`);
  }
  return result.stdout;
}

function git(cwd, args) {
  const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
  return succeeded(result, `git ${args[0]}`).trim();
}

// Two commits: the base already has a long src/old.mjs and src/grown.mjs. The
// head edits old.mjs without changing its length, grows grown.mjs by a line,
// and adds a long src/added.mjs.
function twoCommits(repo) {
  mkdirSync(join(repo, "src"), { recursive: true });
  git(repo, ["init", "--quiet"]);
  writeFileSync(join(repo, "src", "old.mjs"), lines(OLD_LINES));
  writeFileSync(join(repo, "src", "grown.mjs"), lines(OLD_LINES));
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "--quiet", "-m", "base"]);
  const base = git(repo, ["rev-parse", "HEAD"]);
  writeFileSync(join(repo, "src", "old.mjs"), lines(OLD_LINES).replace("v0 = 0;", "v0 = 1;"));
  writeFileSync(join(repo, "src", "grown.mjs"), lines(OLD_LINES + 1));
  writeFileSync(join(repo, "src", "added.mjs"), lines(NEW_LINES));
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "--quiet", "-m", "head"]);
  return base;
}

function scanWith(dir, extra) {
  const repo = join(dir, "repo");
  mkdirSync(repo);
  const base = twoCommits(repo);
  const registry = join(dir, "plugins.json");
  writeFileSync(registry, JSON.stringify([{ id: "quality-guard@local", enabled: true, installPath: QUALITY_GUARD }]));
  const out = join(dir, "scan.json");
  const args = ["scan", "--client=claude", `--registry=${registry}`, `--root=${repo}`, `--out=${out}`, ...extra(base)];
  const printed = JSON.parse(succeeded(spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" }), "scan"));
  const report = JSON.parse(readFileSync(out, "utf8"));
  const length = (name) => report.violations.find((item) => item.rule === "file-length" && item.file.endsWith(name));
  return { printed, report, old: length("old.mjs"), added: length("added.mjs"), grown: length("grown.mjs") };
}

function inTempDir(body) {
  const dir = mkdtempSync(join(tmpdir(), "review-baseline-"));
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("scan --base marks the findings the merge base already had, and not one that grew", () => {
  inTempDir((dir) => {
    const { printed, report, old, added, grown } = scanWith(dir, (base) => [`--base=${base}`]);
    assert.equal(old.existing, true);
    assert.equal(added.existing, undefined);
    assert.equal(grown.existing, undefined);
    assert.equal(report.baseline.existing > 0, true);
    assert.equal(printed.baseline.base, report.baseline.base);
  });
});

test("scan without a full-SHA --base, or --base on another command, stops with usage", () => {
  const scanFlags = ["--client=claude", "--registry=r.json", "--root=.", "--out=o.json"];
  const refused = [
    ["scan", ...scanFlags],
    ["scan", ...scanFlags, "--base=abc1234"],
    ["scan", ...scanFlags, "--base"],
    ["existing", "--reviews=r.json", `--base=${"a".repeat(SHA_LENGTH)}`],
  ];
  for (const args of refused) {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
    assert.equal(result.status, USAGE_EXIT, args.join(" "));
  }
});
