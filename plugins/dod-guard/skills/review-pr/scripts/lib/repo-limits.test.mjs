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
import { applyRepoLimits, editorconfigWidths, gateRuleFloors, repoLimits } from "./repo-limits.mjs";

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

test("the real scan of a width-120 repository keeps only what its own limits flag", () => {
  const root = limitedRepository();
  try {
    const raw = realScan(root);
    assert.deepEqual(summary(raw), ["file-length:1:medium", "line-length:3:medium", "line-length:4:high"]);
    const limits = repoLimits(root);
    assert.deepEqual(limits.floors, { "line-length": "high", "file-length": "high" });
    const { scan, removed } = applyRepoLimits(raw, limits);
    assert.deepEqual(summary(scan), ["line-length:4:high"]);
    assert.equal(scan.violations[0].message, "line is 133 chars (width 120)");
    assert.deepEqual(removed, { "file-length": 1, "line-length": 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("editorconfigWidths lets the last matching section win and honours off", () => {
  const widthFor = editorconfigWidths(
    "[*]\nmax_line_length = 100\n[*.{md,txt}]\nmax_line_length = off\n[src/**.cs]\nmax_line_length=140\n",
  );
  assert.equal(widthFor("lib/a.mjs"), 100);
  assert.equal(widthFor("docs/readme.md"), null);
  assert.equal(widthFor("src/Game/a.cs"), 140);
  assert.equal(widthFor("tests/a.cs"), 100);
  assert.equal(editorconfigWidths("[**/*.cs]\nmax_line_length = 120\n")("Wide.cs"), 120);
  assert.equal(editorconfigWidths("[src/**/*.cs]\nmax_line_length = 120\n")("src/a.cs"), 120);
  assert.equal(editorconfigWidths("[*.cs]\nindent_size = 4\n")("a.cs"), undefined);
});

test("gateRuleFloors reads only the gate step and skips comment lines", () => {
  assert.deepEqual(gateRuleFloors([WORKFLOW]), { "line-length": "high", "file-length": "high" });
  assert.deepEqual(gateRuleFloors(["steps:\n  - run: npm test --rule-block-on=x:high\n"]), {});
  const trailing = "  - run: node quality-pr-gate.mjs --root=. # --rule-block-on=complexity:high\n";
  assert.deepEqual(gateRuleFloors([trailing]), {});
});

test("a line-length finding at a formatter width is left alone", () => {
  const violation = { file: "a.mjs", line: 2, rule: "line-length", severity: "medium", metric: 100 };
  const formatted = { ...violation, widthSource: "biome.json" };
  const limits = { widthFor: () => 120, floors: {} };
  assert.deepEqual(applyRepoLimits({ violations: [formatted] }, limits).scan.violations, [formatted]);
  assert.deepEqual(applyRepoLimits({ violations: [violation] }, limits).scan.violations, []);
});
