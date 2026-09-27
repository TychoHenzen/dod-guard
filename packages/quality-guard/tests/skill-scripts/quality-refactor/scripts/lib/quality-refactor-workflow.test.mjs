import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const skillPath = fileURLToPath(
  new URL("../../../../../skills/quality-refactor/SKILL.md", import.meta.url),
);
const skill = await readFile(skillPath, "utf8");

const whitespace = /\s+/g;

function section(heading, nextHeading) {
  const start = skill.indexOf(heading);
  const end = skill.indexOf(nextHeading, start);
  assert.notEqual(start, -1, `${heading} is required`);
  assert.notEqual(end, -1, `${nextHeading} is required`);
  return skill.slice(start, end);
}

function assertSignals(text, signals, name) {
  for (const signal of signals) {
    assert.ok(text.includes(signal), `${name} must contain ${signal}`);
  }
}

test("quality-refactor documents defaults and evidence", () => {
  assertSignals(
    section("## Defaults and evidence", "## Start"),
    [
      "repository-relative scope",
      "repository root",
      "default` profile",
      "node <quality-scan.mjs> . --root=<repository> --top=20",
      "node <quality-scan.mjs> . --root=<repository> --format=units > .quality/units.json",
      "quality-guard report --root=<repository> > .quality/quality-report.json",
      ".quality/responsibility-map.json",
      "read-only",
    ],
    "defaults",
  );
});

test("quality-refactor documents the staged gate and recovery", () => {
  const plan = section("## Plan from ownership", "## Recovery and stops");
  assert.ok(
    plan.includes(
      "quality-guard check --staged --intent refactor --target .quality/responsibility-map.json --json",
    ),
  );

  assertSignals(
    section("## Recovery and stops", "## Execute"),
    [
      "PostToolUse hook",
      "file-local, fail-open feedback",
      "--write-baseline=.github/quality/quality-baseline.json",
      ".quality-skip",
      '{"rebaseline": true}',
      ".github/quality/skip-log.json",
      "REVIEW_REQUIRED",
      "repair `FAIL`",
      "deterministic code or\n  configuration finding",
      "Scanner, materialization, or analysis errors",
      "credentials",
      "destructive intent",
      "unresolved ownership",
      "missing acceptance evidence",
      "arbitrary\n  elapsed-time kill",
    ],
    "recovery",
  );
});

test("quality-refactor documents execution and committed verification", () => {
  const execute = section("## Execute", "## Finish");
  assert.ok(
    execute.includes(
      "stage only its files, then run the staged refactor decision",
    ),
  );

  const finish = section("## Finish", "Rules and remediation guidance");
  assertSignals(
    finish,
    [
      "full build, tests",
      "final scanner with `--fail-on=error`",
      ".quality/quality-report.json",
      "quality-guard check --committed HEAD --json",
    ],
    "finish",
  );
  assert.ok(
    finish
      .replace(whitespace, " ")
      .includes("committed replay is the final local proof"),
  );
});
