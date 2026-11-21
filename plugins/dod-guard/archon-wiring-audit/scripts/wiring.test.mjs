import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { citationProblem } from "./evidence.mjs";
import { check, STAGES } from "./wiring.mjs";

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), "wiring-audit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fixture(t) {
  const repo = scratch(t);
  spawnSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(join(repo, "src"));
  writeFileSync(
    join(repo, "src", "cli.js"),
    "// entry\nexport function main(argv) {\n  if (argv.includes('--fast')) return 1;\n}\n",
  );
  writeFileSync(join(repo, "README.md"), "# Tool\n\nRun `tool` to start.\n");
  spawnSync("git", ["add", "-A"], { cwd: repo });
  return { repo, dir: scratch(t) };
}

const stages = Object.fromEntries(STAGES.map(([key]) => [key, `${key} covered`]));

function audit(findings) {
  return {
    user: "a developer",
    task: "run the tool fast",
    boundary: "user-facing",
    boundaryNote: "the README tells people to run it",
    boundaryEvidence: [{ path: "README.md", line: 3, anchor: "tool" }],
    stages,
    findings,
  };
}

function finding(overrides) {
  return {
    tag: "required",
    surface: "the --fast flag in the README",
    status: "missing",
    impact: "nobody learns the flag exists",
    evidence: [{ path: "src/cli.js", line: 3, anchor: "--fast" }],
    searched: { identifiers: ["--fast"], paths: ["README.md"] },
    limits: "no docs folder exists.",
    next: "document --fast in the README",
    verification: "the README names --fast",
    ...overrides,
  };
}

function run(t, value) {
  const { repo, dir } = fixture(t);
  writeFileSync(join(dir, "findings.json"), JSON.stringify(value));
  const verdict = check({ dir, repo });
  const read = (name) => readFileSync(join(dir, name), "utf8");
  return { verdict, read };
}

test("a sound audit renders the skill's report with the searched paths", (t) => {
  const { verdict, read } = run(t, audit([finding({ tag: "optional" }), finding({})]));
  assert.equal(verdict, "PASS");
  const report = read("report.md");
  assert.match(report, /^## Wiring audit\nIntended user and task: a developer; run the tool fast\.\n/);
  assert.match(report, /- Entry point: entry covered/);
  assert.ok(report.indexOf("[required]") < report.indexOf("[optional]"), "required findings come first");
  assert.match(report, /Evidence: src\/cli\.js:3 \(--fast\)/);
  assert.match(report, /Evidence limits: no docs folder exists\. Searched for --fast in README\.md\./);
});

test("a surface called missing where its identifier appears goes back with the file named", (t) => {
  const { verdict, read } = run(
    t,
    audit([finding({ searched: { identifiers: ["--fast"], paths: ["src", "README.md"] } })]),
  );
  assert.equal(verdict, "RETRY");
  assert.match(read("feedback.md"), /'--fast' appears in src\/cli\.js, so the surface is not missing/);
});

test("searching a path that does not exist proves nothing", (t) => {
  const { verdict, read } = run(t, audit([finding({ searched: { identifiers: ["--fast"], paths: ["docs"] } })]));
  assert.equal(verdict, "RETRY");
  assert.match(read("feedback.md"), /docs does not exist, so it proves nothing/);
});

test("bad citations, statuses and empty stages are each reported", (t) => {
  const broken = audit([
    finding({ status: "verified", evidence: [{ path: "src/cli.js", line: 99 }] }),
    finding({ status: "fine", evidence: [{ path: "src/cli.js", line: 2, anchor: "nowhere" }] }),
  ]);
  broken.stages.recovery = "";
  const { verdict, read } = run(t, broken);
  assert.equal(verdict, "RETRY");
  const feedback = read("feedback.md");
  assert.match(feedback, /has 5 lines, so line 99 does not exist/);
  assert.match(feedback, /status must be one of/);
  assert.match(feedback, /at line 2 does not contain 'nowhere'/);
  assert.match(feedback, /stages\.recovery \(Recovery\)/);
});

test("not applicable needs evidence, and a missing findings file is a retry", (t) => {
  const { repo, dir } = fixture(t);
  assert.equal(check({ dir, repo }), "RETRY");
  const internal = audit([]);
  internal.boundary = "not applicable";
  internal.boundaryEvidence = [];
  writeFileSync(join(dir, "findings.json"), JSON.stringify(internal));
  assert.equal(check({ dir, repo }), "RETRY");
  assert.match(readFileSync(join(dir, "feedback.md"), "utf8"), /intentionally internal/);
});

test("citations outside the checkout are refused", () => {
  assert.match(citationProblem(process.cwd(), { path: "../x" }), /not a repository-relative path/);
  assert.match(citationProblem(process.cwd(), { path: "/etc/passwd" }), /not a repository-relative path/);
});
