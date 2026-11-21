import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ACCESSIBILITY, check, JOURNEY, NO_BROWSER, TRUST } from "./usability.mjs";

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "usability-review-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fixture(t) {
  const repo = scratch(t);
  mkdirSync(join(repo, "src"));
  writeFileSync(join(repo, "src", "cli.js"), "// help\nconsole.log('usage: tool <file>');\nprocess.exit(2);\n");
  writeFileSync(join(repo, "src", "theme.css"), "button { color: #222; background: #fff; min-height: 44px; }\n");
  return { repo, dir: scratch(t) };
}

const cite = [{ path: "src/cli.js", line: 2, anchor: "usage" }];
const covered = { status: "covered", note: "the usage line names the one argument", evidence: cite };

function all(table, item) {
  return Object.fromEntries(table.map(([key]) => [key, item]));
}

function review(overrides) {
  return {
    user: "a developer",
    task: "check one file",
    outcome: "a clear verdict",
    surface: "CLI",
    evidenceUsed: ["src/cli.js"],
    evidenceUnavailable: [],
    journey: { ...all(JOURNEY, covered), progress: { status: "inapplicable" }, wording: { status: "not observed" } },
    usesAi: false,
    findings: [
      {
        severity: "low",
        title: "terse usage",
        impact: "a little guessing",
        evidence: cite,
        change: "add an example",
        verification: "help shows an example",
      },
      {
        severity: "high",
        title: "exit 2 says nothing",
        impact: "the user cannot tell what failed",
        evidence: [{ path: "src/cli.js", line: 3 }],
        change: "print the reason before exiting",
        verification: "a bad call prints why",
      },
    ],
    ...overrides,
  };
}

function run(t, value) {
  const { repo, dir } = fixture(t);
  writeFileSync(join(dir, "findings.json"), JSON.stringify(value));
  return { verdict: check({ dir, repo }), read: (name) => readFileSync(join(dir, name), "utf8") };
}

test("a CLI review renders the skill's report, high severity first", (t) => {
  const { verdict, read } = run(t, review({}));
  assert.equal(verdict, "PASS");
  const report = read("report.md");
  assert.match(report, /^## Usability review\n\nIntended user and task: a developer, who wants to check one file/);
  assert.match(report, /Not observed: hierarchy and wording\n/);
  assert.match(report, /Inapplicable states: progress and empty states\n/);
  assert.match(report, /Evidence unavailable: none\n/);
  assert.ok(report.indexOf("[high]") < report.indexOf("[low]"));
  assert.doesNotMatch(report, /semantic structure/);
});

test("a GUI review needs every accessibility check and says no live state was seen", (t) => {
  const partial = review({ surface: "GUI", accessibility: { contrast: covered } });
  const first = run(t, partial);
  assert.equal(first.verdict, "RETRY");
  assert.match(
    first.read("feedback.md"),
    /accessibility\.keyboard \(keyboard operation\): status must be one of covered, not observed/,
  );
  const full = review({
    surface: "GUI",
    accessibility: {
      ...all(ACCESSIBILITY, { status: "not observed" }),
      target: { status: "covered", note: "44px minimum height", evidence: [{ path: "src/theme.css", line: 1 }] },
    },
  });
  const second = run(t, full);
  assert.equal(second.verdict, "PASS");
  assert.match(second.read("report.md"), new RegExp(`Evidence unavailable: ${NO_BROWSER}`));
  assert.match(second.read("report.md"), /target size: 44px minimum height \(src\/theme\.css:1\)/);
});

test("a verdict is not a value, visual checks on a CLI are refused, and trust follows usesAi", (t) => {
  const { verdict, read } = run(
    t,
    review({
      journey: { ...all(JOURNEY, covered), error: { status: "covered", note: "passes", evidence: cite } },
      accessibility: all(ACCESSIBILITY, { status: "not observed" }),
      trust: all(TRUST, { status: "not observed" }),
    }),
  );
  assert.equal(verdict, "RETRY");
  const feedback = read("feedback.md");
  assert.match(feedback, /'passes' is a verdict/);
  assert.match(feedback, /gets no visual checks/);
  assert.match(feedback, /leave AI trust cues out/);
});

test("an AI feature needs its trust cues, and covered items need real citations", (t) => {
  const { verdict, read } = run(
    t,
    review({
      usesAi: true,
      journey: { ...all(JOURNEY, covered), success: { status: "covered", note: "prints ok", evidence: [] } },
      findings: [
        {
          severity: "urgent",
          title: "x",
          impact: "y",
          evidence: [{ path: "src/gone.js" }],
          change: "z",
          verification: "w",
        },
      ],
    }),
  );
  assert.equal(verdict, "RETRY");
  const feedback = read("feedback.md");
  assert.match(feedback, /trust must be an object/);
  assert.match(feedback, /journey\.success \(success and feedback\): needs at least one citation/);
  assert.match(feedback, /severity must be one of high, medium, low/);
  assert.match(feedback, /cited file src\/gone\.js does not exist/);
});
