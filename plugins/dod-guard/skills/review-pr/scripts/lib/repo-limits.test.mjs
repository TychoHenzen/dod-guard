// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join, resolve } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { fileURLToPath } from "node:url";
import { applyRepoLimits, gateRuleFloors, repoLimits } from "./repo-limits.mjs";

const REPOSITORY = fileURLToPath(new URL("../../../../../../", import.meta.url));
const SCANNER = resolve(REPOSITORY, "packages/quality-guard/skills/quality-refactor/scripts/quality-scan.mjs");

// The disc-golf shape: width 120 for C#, and a gate step whose flags sit in a
// folded run block next to a YAML comment quoting a flag the gate never gets.
const EDITORCONFIG = "root = true\n\n[*]\nindent_style = space\n\n[*.cs]\nmax_line_length = 120\n";
const WORKFLOW = [
  "jobs:",
  "  quality-guard:",
  "    steps:",
  "      # --rule-block-on=complexity:high is only a comment",
  "      - name: Block new findings",
  "        run: >-",
  "          node .dod-guard/scripts/quality-pr-gate.mjs --root=src --root=tests",
  "          --block-on=medium --rule-block-on=line-length:high --rule-block-on=file-length:high",
  "      - name: Later step",
  "        run: echo --rule-block-on=dead-export:high",
  "",
].join("\n");

function limitedRepository() {
  const root = mkdtempSync(join(tmpdir(), "repo-limits-"));
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, ".editorconfig"), EDITORCONFIG);
  writeFileSync(join(root, ".github", "workflows", "ci.yml"), WORKFLOW);
  const body = Array.from({ length: 146 }, (_, index) => `    int value${index} = ${index};`);
  const lines = ["class Wide", "{", `    // ${"a".repeat(96)}`, `    // ${"b".repeat(126)}`, ...body, "}"];
  writeFileSync(join(root, "Wide.cs"), `${lines.join("\n")}\n`);
  return root;
}

function realScan(root) {
  const args = [SCANNER, ".", `--root=${root}`, "--format=json", "--rules=line-length,file-length"];
  const run = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

const summary = (scan) => scan.violations.map(({ rule, line, severity }) => `${rule}:${line}:${severity}`).sort();

// The scanner reads .editorconfig itself (issue 988), so the 103-char line is
// never flagged and the 133-char one already carries width 120.
test("the real scan of a width-120 repository keeps only what its own limits flag", () => {
  const root = limitedRepository();
  try {
    const raw = realScan(root);
    assert.deepEqual(summary(raw), ["file-length:1:medium", "line-length:4:high"]);
    assert.equal(raw.violations.find(({ rule }) => rule === "line-length").widthSource, ".editorconfig");
    const limits = repoLimits(root);
    assert.deepEqual(limits.floors, { "line-length": "high", "file-length": "high" });
    const { scan, removed } = applyRepoLimits(raw, limits);
    assert.deepEqual(summary(scan), ["line-length:4:high"]);
    assert.deepEqual(scan.violations[0], raw.violations.find(({ rule }) => rule === "line-length"));
    assert.deepEqual(removed, { "file-length": 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gateRuleFloors reads only the gate step and skips comment lines", () => {
  assert.deepEqual(gateRuleFloors([WORKFLOW]), { "line-length": "high", "file-length": "high" });
  assert.deepEqual(gateRuleFloors(["steps:\n  - run: npm test --rule-block-on=x:high\n"]), {});
  const trailing = "  - run: node quality-pr-gate.mjs --root=. # --rule-block-on=complexity:high\n";
  assert.deepEqual(gateRuleFloors([trailing]), {});
});

// The review leaves widths to the scanner, so it reports what the CI gate
// sees, even for a section name that once made the review's own glob
// matcher backtrack for minutes.
test("a line-length finding passes through whatever the editorconfig says", () => {
  const root = mkdtempSync(join(tmpdir(), "repo-limits-"));
  try {
    const sections = [`[${"**/".repeat(30)}x]`, "max_line_length = off", "[a,b]", "max_line_length = 200"];
    writeFileSync(join(root, ".editorconfig"), `${sections.join("\n")}\n`);
    const violation = { file: "a/b/c/a", line: 4, rule: "line-length", severity: "medium", metric: 133 };
    const started = Date.now();
    const limited = applyRepoLimits({ violations: [violation] }, repoLimits(root));
    assert.ok(Date.now() - started < 1000);
    assert.deepEqual(limited.scan.violations, [violation]);
    assert.deepEqual(limited.removed, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
