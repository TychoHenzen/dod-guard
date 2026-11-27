import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CAPS, capProblem, requireCap } from "./github-text.mjs";

const CLI = fileURLToPath(new URL("./github-text-check.mjs", import.meta.url));

test("every cap sits far below GitHub's 65536-character limit", () => {
  assert.deepEqual(CAPS, {
    reviewBody: 8000,
    reviewComment: 2000,
    comment: 3000,
    stepPlan: 6000,
    issueBody: 8000,
    prBody: 4000,
  });
  for (const cap of Object.values(CAPS)) {
    assert.ok(cap <= 65_536 / 8);
  }
});

test("a text at its cap fits and one character more does not", () => {
  for (const [kind, cap] of Object.entries(CAPS)) {
    assert.equal(capProblem(kind, "x".repeat(cap)), null);
    const problem = capProblem(kind, "x".repeat(cap + 1), "handoff.md");
    assert.match(problem, new RegExp(`handoff\\.md is ${cap + 1} characters, over the ${cap}-character cap for ${kind}`));
    assert.match(problem, /Nothing was posted\. Write it again shorter/);
    assert.match(problem, /Do not cut it off/);
  }
});

test("requireCap returns a fitting text and refuses a long one", () => {
  assert.equal(requireCap("comment", "short"), "short");
  assert.throws(() => requireCap("comment", "x".repeat(3001), "the comment"), /the comment is 3001 characters/);
});

test("an unknown kind is refused by name", () => {
  assert.throws(() => capProblem("essay", "x"), /unknown GitHub text kind "essay"; use one of reviewBody/);
});

function check(kind, text) {
  const dir = mkdtempSync(join(tmpdir(), "github-text-"));
  try {
    const file = join(dir, "text.md");
    writeFileSync(file, text);
    const result = spawnSync(process.execPath, [CLI, `--kind=${kind}`, `--file=${file}`], { encoding: "utf8" });
    return { status: result.status, out: JSON.parse(result.stdout) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the check CLI exits 0 within the cap, 1 over it, and 2 on a usage error", () => {
  const fits = check("issueBody", "x".repeat(8000));
  assert.equal(fits.status, 0);
  assert.deepEqual(fits.out, { ok: true, kind: "issueBody", length: 8000, cap: 8000 });

  const over = check("stepPlan", "x".repeat(6001));
  assert.equal(over.status, 1);
  assert.equal(over.out.ok, false);
  assert.match(over.out.problem, /6001 characters, over the 6000-character cap for stepPlan/);

  assert.equal(check("essay", "x").status, 2);
  const bare = spawnSync(process.execPath, [CLI, "--kind=comment"], { encoding: "utf8" });
  assert.equal(bare.status, 2);
  assert.match(JSON.parse(bare.stdout).problem, /usage: github-text-check\.mjs --kind=/);
});
