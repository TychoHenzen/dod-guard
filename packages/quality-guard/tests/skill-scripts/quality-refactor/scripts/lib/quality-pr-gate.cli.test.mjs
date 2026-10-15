import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const GATE = fileURLToPath(
  new URL("../../../../../skills/quality-refactor/scripts/quality-pr-gate.mjs", import.meta.url),
);

// Over the scanner's 80-column medium limit, under its 120-column high limit.
const LONG_LINE = `const label = "${"x".repeat(90)}";`;
const SHORT_LINE = 'const label = "short";';

function git(cwd, ...args) {
  const result = spawnSync("git", ["-c", "user.email=t@example.test", "-c", "user.name=t", ...args], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
}

function write(repo, path, content) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}

// A repo whose main branch holds src/a.js, then a feature branch that rewrites it.
function pullRequest(t, { base, head }) {
  const repo = mkdtempSync(join(tmpdir(), "quality-pr-gate-test-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, "init", "-q", "-b", "main");
  write(repo, "src/a.js", base);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  git(repo, "checkout", "-q", "-b", "feature");
  write(repo, "src/a.js", head);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "head");
  return repo;
}

function runGate(repo, ...extra) {
  const report = join(repo, "report.md");
  const comment = join(repo, "comment.md");
  const result = spawnSync(
    process.execPath,
    [GATE, "--base=main", "--root=src", `--report=${report}`, `--comment=${comment}`, ...extra],
    { cwd: repo, encoding: "utf8" },
  );
  return { ...result, report, comment };
}

test("a pull request that adds a medium finding is blocked", (t) => {
  const repo = pullRequest(t, { base: `${SHORT_LINE}\n`, head: `${SHORT_LINE}\n${LONG_LINE}\n` });
  const result = runGate(repo);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /src\/a\.js:2 line-length/);
  assert.match(readFileSync(result.comment, "utf8"), /^<!-- quality-pr-gate -->/);
});

test("a pre-existing finding does not block, but the pull request must remove one", (t) => {
  const repo = pullRequest(t, { base: `${LONG_LINE}\n`, head: `${LONG_LINE}\n${SHORT_LINE.replace("label", "other")}\n` });
  const result = runGate(repo);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /line-length/);
  assert.match(result.stderr, /quota NOT met/);
  assert.match(readFileSync(result.report, "utf8"), /Pre-existing findings still open in the changed files \(1\)/);
});

test("removing a pre-existing finding satisfies the quota", (t) => {
  const repo = pullRequest(t, { base: `${LONG_LINE}\n`, head: `${SHORT_LINE}\n` });
  const result = runGate(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /quota met/);
  assert.match(readFileSync(result.report, "utf8"), /removed by this pull request \(1\)/);
});

test("a per-rule override lets a new line-length finding through", (t) => {
  const repo = pullRequest(t, { base: `${LONG_LINE}\n`, head: `${LONG_LINE}\n${LONG_LINE.replace("label", "more")}\n` });
  const blocked = runGate(repo);
  assert.equal(blocked.status, 1);
  const allowed = runGate(repo, "--rule-block-on=line-length:high", "--fix-medium-high=0", "--fix-low=0");
  assert.equal(allowed.status, 0, allowed.stderr);
});

test("an unchanged tree reports no changed files and writes nothing", (t) => {
  const repo = pullRequest(t, { base: `${SHORT_LINE}\n`, head: `${SHORT_LINE}\n// edit\n` });
  git(repo, "reset", "-q", "--hard", "main");
  const result = runGate(repo);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no changed files/);
  assert.equal(existsSync(result.report), false);
});

test("a base that cannot be resolved is an error, not a pass", (t) => {
  const repo = pullRequest(t, { base: `${SHORT_LINE}\n`, head: `${LONG_LINE}\n` });
  const result = spawnSync(process.execPath, [GATE, "--base=nope", "--root=src"], { cwd: repo, encoding: "utf8" });
  assert.equal(result.status, 2);
});
