import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pullRequest, runGate } from "./quality-pr-gate-cli-test-support.mjs";

// No biome.json in these repos, so the scanner's fallback limits apply: a
// 90 character line is a medium finding.
const LONG_LINE = `const label = "${"x".repeat(90)}";`;
const SHORT_LINE = 'const label = "short";';

// A file where git wants its worktrees directory makes `git worktree add`
// fail, the way a repository that forbids worktrees does.
function forbidWorktrees(repo) {
  writeFileSync(join(repo, ".git", "worktrees"), "");
}

test("the gate judges a pull request where worktrees are forbidden", (t) => {
  const repo = pullRequest(t, {
    base: `${LONG_LINE}\n`,
    head: `${SHORT_LINE}\n`,
  });
  forbidWorktrees(repo);
  const result = runGate(repo);
  assert.equal(result.status, 0, result.stderr);
  const report = readFileSync(result.report, "utf8");
  assert.match(report, /removed by this pull request \(1\)/);
  assert.match(result.stdout, /quota met/);
});

// HEAD drops the exclusion, so only the merge base's own config hides extern/.
test("the merge base scan still reads the base's own exclusions", (t) => {
  const config = JSON.stringify({ excludePaths: ["/extern/"] });
  const repo = pullRequest(t, {
    base: { "src/a.js": `${SHORT_LINE}\n`, ".quality-guard.json": config },
    head: {
      "src/a.js": `${SHORT_LINE}\n${LONG_LINE}\n`,
      "extern/v.js": `${LONG_LINE}\n`,
      ".quality-guard.json": JSON.stringify({ excludePaths: [] }),
    },
  });
  forbidWorktrees(repo);
  const result = runGate(repo);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /src\/a\.js:2 line-length/);
  assert.doesNotMatch(result.stderr, /extern/);
});
