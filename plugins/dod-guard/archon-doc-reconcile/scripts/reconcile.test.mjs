import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { git, initRepo, scratch } from "../../archon-shared/scripts/testing.mjs";
import {
  advance,
  BUDGET,
  globToRegExp,
  hunks,
  plan,
  prep,
  rangesFit,
  replyProblem,
  report,
  textAt,
  verify,
} from "./reconcile.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const claimAge = join(here, "..", "..", "skills", "doc-reconcile", "scripts", "claim-age.mjs");

const PAIR = {
  a: { file: "a.md", startLine: 1, endLine: 1, heading: "", text: "The pool runs 4 workers." },
  b: { file: "b.md", startLine: 3, endLine: 3, heading: "", text: "The pool runs  8 workers by default." },
};

function writeCandidates(dir, pairs) {
  const path = join(dir, "candidates.json");
  writeFileSync(path, JSON.stringify({ options: { threshold: 0.35, limit: null }, pairs }));
  return path;
}

function reply(dir, value) {
  writeFileSync(join(dir, "verdict.json"), JSON.stringify(value));
}

test("a CONFLICT must quote words from each claim, in either order", () => {
  const base = { verdict: "CONFLICT", why: "different counts" };
  assert.equal(replyProblem({ ...base, evidenceA: "4 workers", evidenceB: "8 workers" }, PAIR), null);
  assert.equal(replyProblem({ ...base, evidenceA: "8  workers", evidenceB: "4 workers" }, PAIR), null);
  assert.match(replyProblem({ ...base, evidenceA: "4 workers", evidenceB: "4 workers" }, PAIR), /each claim/);
  assert.match(replyProblem({ ...base, evidenceA: "", evidenceB: "8 workers" }, PAIR), /each claim/);
});

test("a reply needs a known verdict and a reason", () => {
  assert.match(replyProblem(null, PAIR), /no reply/);
  assert.match(replyProblem({ verdict: "MAYBE", why: "x" }, PAIR), /unknown verdict/);
  assert.match(replyProblem({ verdict: "UNRELATED", why: " " }, PAIR), /no reason/);
  assert.equal(replyProblem({ verdict: "UNRELATED", why: "shared words only" }, PAIR), null);
});

test("a malformed reply is re-dispatched once, then the pair is undecided", (t) => {
  const dir = scratch(t, "reconcile-");
  assert.equal(prep({ dir, candidates: writeCandidates(dir, [PAIR, PAIR]) }), 2);
  assert.equal(JSON.parse(readFileSync(join(dir, "current.json"), "utf8")).id, "p1");
  assert.equal(advance({ dir }), false);
  assert.equal(JSON.parse(readFileSync(join(dir, "current.json"), "utf8")).id, "p1");
  reply(dir, { verdict: "MAYBE", why: "x" });
  assert.equal(advance({ dir }), false);
  assert.equal(JSON.parse(readFileSync(join(dir, "current.json"), "utf8")).id, "p2");
  reply(dir, { verdict: "UNRELATED", why: "shared words only" });
  assert.equal(advance({ dir }), true);
  assert.equal(existsSync(join(dir, "current.json")), false);
  const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  assert.equal(state.undecided.p1.reason, "malformed verdict");
  assert.equal(state.verdicts.p2.verdict, "UNRELATED");
});

test("pairs past the dispatch budget are undecided", (t) => {
  const dir = scratch(t, "reconcile-");
  prep({
    dir,
    candidates: writeCandidates(
      dir,
      Array.from({ length: BUDGET + 2 }, () => PAIR),
    ),
  });
  let done = false;
  for (let round = 0; round < BUDGET; round += 1) {
    reply(dir, { verdict: "UNRELATED", why: "shared words only" });
    done = advance({ dir });
  }
  assert.equal(done, true);
  const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  assert.equal(Object.keys(state.verdicts).length, BUDGET);
  assert.deepEqual(
    Object.values(state.undecided).map((entry) => entry.reason),
    ["out of budget", "out of budget"],
  );
});

test("globs match whole repository paths", () => {
  assert.equal(globToRegExp("plugins/*/agents/*.md").test("plugins/dod-guard/agents/judge.md"), true);
  assert.equal(globToRegExp("plugins/*/agents/*.md").test("plugins/dod-guard/agents/x/judge.md"), false);
  assert.equal(globToRegExp("docs/**").test("docs/a/b.md"), true);
  assert.equal(globToRegExp("a.md").test("xa.md"), false);
});

test("hunks report the original-side ranges an edit touches", () => {
  const diff = ["@@ -3,2 +3,0 @@", "-x", "-y", "@@ -9 +7 @@", "-a", "+b", "@@ -12,0 +11,1 @@", "+new"].join("\n");
  assert.deepEqual(hunks(diff), [
    { start: 3, end: 4 },
    { start: 9, end: 9 },
    { start: 12.5, end: 12.5 },
  ]);
  const targets = [
    { startLine: 3, endLine: 4 },
    { startLine: 9, endLine: 12 },
  ];
  assert.equal(rangesFit(hunks(diff), targets), true);
  assert.equal(rangesFit([{ start: 5, end: 5 }], targets), false);
});

test("a hunk may span adjacent planned ranges but not a gap between them", () => {
  const adjacent = [
    { startLine: 3, endLine: 3 },
    { startLine: 4, endLine: 4 },
  ];
  assert.equal(rangesFit([{ start: 3, end: 4 }], adjacent), true);
  assert.equal(rangesFit([{ start: 3, end: 4 }], adjacent.slice(0, 1)), false);
  const gapped = [adjacent[0], { startLine: 5, endLine: 5 }];
  assert.equal(rangesFit([{ start: 3, end: 5 }], gapped), false);
  for (const at of [2.5, 3.5, 4.5]) {
    assert.equal(rangesFit([{ start: at, end: at }], adjacent), true);
  }
  assert.equal(rangesFit([{ start: 5.5, end: 5.5 }], adjacent), false);
});

// The claim dates come from the commits, so each one is made at a fixed time.
function commitAt(repo, message, date) {
  git(repo, ["add", "-A"]);
  const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  const result = spawnSync("git", ["commit", "-q", "-m", message], { cwd: repo, encoding: "utf8", env });
  assert.equal(result.status, 0, result.stderr);
}

function fixtureRepo(t) {
  const repo = initRepo(t, "reconcile-");
  writeFileSync(join(repo, "old.md"), "# Old\n\nThe pool runs 4 workers.\n");
  commitAt(repo, "old claim", "2026-01-01T00:00:00Z");
  writeFileSync(join(repo, "new.md"), "# New\n\nThe pool runs 8 workers.\n");
  writeFileSync(join(repo, "gen.md"), "# Gen\n\nThe pool runs 8 workers.\n");
  commitAt(repo, "new claim", "2026-03-01T00:00:00Z");
  return repo;
}

const OLD = { file: "old.md", startLine: 3, endLine: 3, heading: "Old", text: "The pool runs 4 workers." };
const NEW = { file: "new.md", startLine: 3, endLine: 3, heading: "New", text: "The pool runs 8 workers." };
const GEN = { file: "gen.md", startLine: 3, endLine: 3, heading: "Gen", text: "The pool runs 8 workers." };

test("textAt reads Markdown ranges and manifest descriptions", (t) => {
  const repo = fixtureRepo(t);
  assert.equal(textAt(repo, OLD), OLD.text);
  writeFileSync(join(repo, "plugin.json"), '{\r\n  "description": "A \\"quoted\\" tool"\r\n}\r\n');
  assert.equal(textAt(repo, { file: "plugin.json", startLine: 2, endLine: 2 }), 'A "quoted" tool');
  assert.equal(textAt(repo, { file: "missing.md", startLine: 1, endLine: 1 }), null);
});

test("the plan deletes the older side, skips generated sources, and verify keeps only planned edits", (t) => {
  const repo = fixtureRepo(t);
  const dir = scratch(t, "reconcile-");
  prep({
    dir,
    candidates: writeCandidates(dir, [
      { score: 0.9, a: NEW, b: OLD },
      { score: 0.8, a: OLD, b: GEN },
    ]),
  });
  reply(dir, { verdict: "CONFLICT", evidenceA: "8 workers", evidenceB: "4 workers", why: "counts differ" });
  advance({ dir });
  reply(dir, { verdict: "CONFLICT", evidenceA: "4 workers", evidenceB: "8 workers", why: "counts differ" });
  advance({ dir });

  assert.equal(plan({ dir, repo, claimAge, generated: "gen.md" }), 1);
  const planned = JSON.parse(readFileSync(join(dir, "plan.json"), "utf8"));
  assert.equal(planned.actions[0].target.file, "old.md");
  assert.equal(planned.actions[0].kind, "delete");
  assert.equal(planned.undecided[0].reason, "generated source");

  // The apply session deletes the claim and also strays into another file.
  writeFileSync(join(repo, "old.md"), "# Old\n\n");
  writeFileSync(join(repo, "new.md"), "# New\n\nchanged\n");
  writeFileSync(join(repo, "notes.txt"), "scratch\n");
  assert.equal(verify({ dir, repo }), 1);
  assert.equal(readFileSync(join(repo, "new.md"), "utf8"), "# New\n\nThe pool runs 8 workers.\n");
  assert.equal(existsSync(join(repo, "notes.txt")), false);

  const text = report({ dir });
  assert.match(text, /Deleted `old\.md:3-3`, which contradicts `new\.md:3-3`/);
  assert.match(text, /generated source/);
  assert.match(text, /Reverted `new\.md`/);
});

test("an edit outside the planned range reverts the file and leaves its pair undecided", (t) => {
  const repo = fixtureRepo(t);
  const dir = scratch(t, "reconcile-");
  prep({ dir, candidates: writeCandidates(dir, [{ score: 0.9, a: NEW, b: OLD }]) });
  reply(dir, { verdict: "CONFLICT", evidenceA: "8 workers", evidenceB: "4 workers", why: "counts differ" });
  advance({ dir });
  plan({ dir, repo, claimAge });
  writeFileSync(join(repo, "old.md"), "# Renamed\n\n");
  assert.equal(verify({ dir, repo }), 0);
  const planned = JSON.parse(readFileSync(join(dir, "plan.json"), "utf8"));
  assert.equal(planned.applied.length, 0);
  assert.equal(planned.undecided[0].reason, "edit outside the named range");
});

test("deleting two adjacent claims in one hunk counts both as applied", (t) => {
  const repo = initRepo(t, "reconcile-");
  writeFileSync(join(repo, "doc.md"), "# Doc\n\nClaim one.\nClaim two.\nTail.\n");
  commitAt(repo, "claims", "2026-01-01T00:00:00Z");
  const dir = scratch(t, "reconcile-");
  const at = (line) => ({ file: "doc.md", startLine: line, endLine: line, heading: "Doc", text: "" });
  const actions = [3, 4].map((line) => ({ id: `p${line}`, kind: "delete", target: at(line), survivor: NEW }));
  writeFileSync(join(dir, "plan.json"), JSON.stringify({ actions, undecided: [] }));
  writeFileSync(join(repo, "doc.md"), "# Doc\n\nTail.\n");
  assert.equal(verify({ dir, repo }), 1);
  const planned = JSON.parse(readFileSync(join(dir, "plan.json"), "utf8"));
  assert.deepEqual(planned.undecided, []);
  assert.deepEqual(
    planned.applied.map((entry) => [entry.target.startLine, entry.target.endLine]),
    [
      [3, 3],
      [4, 4],
    ],
  );
  assert.equal(readFileSync(join(repo, "doc.md"), "utf8"), "# Doc\n\nTail.\n");
});

function cli(args) {
  return spawnSync(process.execPath, [join(here, "reconcile.mjs"), ...args], { encoding: "utf8" });
}

test("the CLI reads kebab-case options and exits 2 with its name on an error", (t) => {
  const repo = fixtureRepo(t);
  const dir = scratch(t, "reconcile-");
  const candidates = writeCandidates(dir, [{ score: 0.9, a: NEW, b: OLD }]);
  assert.equal(cli(["prep", `--dir=${dir}`, `--candidates=${candidates}`]).stdout, "1\n");
  assert.equal(cli(["advance", `--dir=${dir}`]).status, 1);
  reply(dir, { verdict: "CONFLICT", evidenceA: "8 workers", evidenceB: "4 workers", why: "counts differ" });
  assert.equal(cli(["advance", `--dir=${dir}`]).status, 0);
  const planned = cli(["plan", `--dir=${dir}`, `--repo=${repo}`, `--claim-age=${claimAge}`, "--min-gap=1"]);
  assert.equal(planned.stdout, "1\n", planned.stderr);
  assert.match(cli(["report", `--dir=${dir}`]).stdout, /^## Doc reconcile\n/);
  const missing = cli(["report"]);
  assert.equal(missing.status, 2);
  assert.equal(missing.stderr, "reconcile: missing --dir\n");
});
