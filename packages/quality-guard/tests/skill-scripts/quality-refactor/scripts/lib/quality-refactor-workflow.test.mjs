import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const skillPath = fileURLToPath(
  new URL("../../../../../skills/quality-refactor/SKILL.md", import.meta.url),
);
const skill = await readFile(skillPath, "utf8");

test("quality-refactor never invokes the retired decision route", () => {
  assert.doesNotMatch(skill, /QUALITY_GUARD_INTERNAL_CHECK=1/);
  assert.doesNotMatch(skill, /quality-guard check --(?:staged|committed)/);
});

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

test("quality-refactor documents advisory evidence and recovery", () => {
  const plan = section("## Plan from ownership", "## Recovery and stops");
  assertSignals(
    plan,
    [
      "Before each commit, refresh the report evidence",
      "node <quality-scan.mjs> . --root=<repository> --format=units > .quality/units.json",
      "quality-guard report --root=<repository> > .quality/quality-report.json",
      "read-only evidence",
    ],
    "advisory evidence",
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
      "Scanner, materialization, or report-analysis errors",
      "no staged or committed acceptance decision",
      "credentials",
      "destructive intent",
      "unresolved ownership",
      "missing acceptance evidence",
      "arbitrary\n  elapsed-time kill",
    ],
    "recovery",
  );
});

test("quality-refactor documents execution and final report verification", () => {
  const execute = section("## Execute", "## Finish");
  assert.ok(
    execute.includes("stage only its files, then refresh the report evidence"),
  );

  const finish = section("## Finish", "Rules and remediation guidance");
  assertSignals(
    finish,
    [
      "full build, tests",
      "final scanner with `--fail-on=error`",
      ".quality/quality-report.json",
      "node <quality-scan.mjs> . --root=<repository> --format=units > .quality/units.json",
      "quality-guard report --root=<repository> > .quality/quality-report.json",
      "current diagnostic evidence",
    ],
    "finish",
  );
});
