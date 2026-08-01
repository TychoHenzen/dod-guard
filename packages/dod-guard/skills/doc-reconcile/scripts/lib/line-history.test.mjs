import { test } from "node:test";
import assert from "node:assert/strict";
import { lineHistory, classifyCommit, effectiveDate } from "./line-history.mjs";

// Captured verbatim from this repository. Command used:
//   git log -L 92,92:packages/dod-guard/skills/clean-house/SKILL.md \
//     --format=$'COMMIT\x1f%H\x1f%aI\x1f%s'
// Two commits here. One is a punctuation-only edit. The other created the
// file. This is the exact case blame gets wrong. See line-history.mjs.
const REAL_FIXTURE = [
  "COMMIT\x1f9939622ff637e56c8d2da89f78d0f145806598f5\x1f2026-07-27T11:36:18+02:00\x1fchore: bump dod-guard v2.10.0, evomcp v0.3.4, obsidian-rag v0.1.19",
  "",
  "diff --git a/packages/dod-guard/skills/clean-house/SKILL.md b/packages/dod-guard/skills/clean-house/SKILL.md",
  "--- a/packages/dod-guard/skills/clean-house/SKILL.md",
  "+++ b/packages/dod-guard/skills/clean-house/SKILL.md",
  "@@ -92,1 +92,1 @@",
  "-Search for files, functions, and classes with version/age markers:",
  "+Search for files, functions, and classes with version/age markers.",
  "COMMIT\x1f34c772b987233be5b722ef3d2d7e425ecf3f18cf\x1f2026-07-13T13:47:53+02:00\x1ffeat: add /clean-house skill",
  "",
  "diff --git a/packages/dod-guard/skills/clean-house/SKILL.md b/packages/dod-guard/skills/clean-house/SKILL.md",
  "--- /dev/null",
  "+++ b/packages/dod-guard/skills/clean-house/SKILL.md",
  "@@ -0,0 +92,1 @@",
  "+Search for files, functions, and classes with version/age markers:",
].join("\n");

function stubRun(output) {
  return () => output;
}

test("parses a two-commit history from a real captured fixture", () => {
  const commits = lineHistory({ file: "irrelevant", startLine: 92, endLine: 92 }, stubRun(REAL_FIXTURE));
  assert.equal(commits.length, 2);

  assert.equal(commits[0].sha, "9939622ff637e56c8d2da89f78d0f145806598f5");
  assert.equal(commits[0].authorTime.toISOString(), new Date("2026-07-27T11:36:18+02:00").toISOString());
  assert.equal(commits[0].summary, "chore: bump dod-guard v2.10.0, evomcp v0.3.4, obsidian-rag v0.1.19");
  assert.equal(commits[0].removed, "Search for files, functions, and classes with version/age markers:");
  assert.equal(commits[0].added, "Search for files, functions, and classes with version/age markers.");

  assert.equal(commits[1].sha, "34c772b987233be5b722ef3d2d7e425ecf3f18cf");
  assert.equal(commits[1].authorTime.toISOString(), new Date("2026-07-13T13:47:53+02:00").toISOString());
  assert.equal(commits[1].summary, "feat: add /clean-house skill");
  assert.equal(commits[1].removed, "");
  assert.equal(commits[1].added, "Search for files, functions, and classes with version/age markers:");
});

test("excludes diff header lines from added and removed", () => {
  const fixture = [
    "COMMIT\x1fabc000000000000000000000000000000000000f\x1f2026-01-01T00:00:00+00:00\x1fedit",
    "diff --git a/-weird.md b/-weird.md",
    "index 1111111..2222222 100644",
    "--- a/-weird.md",
    "+++ b/-weird.md",
    "@@ -1,1 +1,1 @@",
    "-old text",
    "+new text",
  ].join("\n");
  const commits = lineHistory({ file: "-weird.md", startLine: 1, endLine: 1 }, stubRun(fixture));
  assert.equal(commits.length, 1);
  assert.equal(commits[0].removed, "old text");
  assert.equal(commits[0].added, "new text");
  assert.ok(!commits[0].removed.includes("diff --git"));
  assert.ok(!commits[0].added.includes("+++"));
});

test("a file-creation commit has empty removed", () => {
  const fixture = [
    "COMMIT\x1fabc000000000000000000000000000000000000f\x1f2026-01-01T00:00:00+00:00\x1fcreate",
    "diff --git a/new.md b/new.md",
    "--- /dev/null",
    "+++ b/new.md",
    "@@ -0,0 +1,1 @@",
    "+brand new line",
  ].join("\n");
  const commits = lineHistory({ file: "new.md", startLine: 1, endLine: 1 }, stubRun(fixture));
  assert.equal(commits.length, 1);
  assert.equal(commits[0].removed, "");
  assert.equal(commits[0].added, "brand new line");
});

test("classifyCommit: a pure rewrap is cosmetic", () => {
  const before = "Search for files, functions, and classes with version markers across the tree.";
  const after = "Search for files, functions,\nand classes with version markers\nacross the tree.";
  assert.equal(classifyCommit(before, after), "cosmetic");
});

test("classifyCommit: a punctuation-only change is cosmetic", () => {
  const before = "Search for files, functions, and classes with version/age markers:";
  const after = "Search for files, functions, and classes with version/age markers.";
  assert.equal(classifyCommit(before, after), "cosmetic");
});

test("classifyCommit: a real wording change is substantive", () => {
  const before = "Search for files, functions, and classes with version/age markers.";
  const after = "Search for modules, functions, and classes with version/age markers.";
  assert.equal(classifyCommit(before, after), "substantive");
});

test("classifyCommit: a number change is substantive", () => {
  const before = "Timeout defaults to 30 seconds.";
  const after = "Timeout defaults to 60 seconds.";
  assert.equal(classifyCommit(before, after), "substantive");
});

function makeDeps({ commits, diffOutput = "" }) {
  return {
    run: () => diffOutput,
    history: () => commits,
  };
}

test("effectiveDate skips a cosmetic commit and returns the older substantive one", () => {
  const newCosmetic = {
    sha: "newsha",
    authorTime: new Date("2026-07-27T11:36:18+02:00"),
    summary: "punctuation fix",
    removed: "Search for markers:",
    added: "Search for markers.",
  };
  const oldSubstantive = {
    sha: "oldsha",
    authorTime: new Date("2026-07-13T13:47:53+02:00"),
    summary: "add the line",
    removed: "",
    added: "Search for markers:",
  };
  const result = effectiveDate(
    { file: "doc.md", startLine: 1, endLine: 1 },
    makeDeps({ commits: [newCosmetic, oldSubstantive] }),
  );
  assert.equal(result.verdict, "dated");
  assert.equal(result.sha, "oldsha");
  assert.equal(result.date.toISOString(), oldSubstantive.authorTime.toISOString());
  assert.deepEqual(result.skipped, [{ sha: "newsha", summary: "punctuation fix" }]);
});

test("effectiveDate returns cosmetic-only with the oldest commit when every commit is cosmetic", () => {
  const first = {
    sha: "sha1",
    authorTime: new Date("2026-07-27T00:00:00Z"),
    summary: "reformat again",
    removed: "Search for markers.",
    added: "Search for markers!",
  };
  const second = {
    sha: "sha2",
    authorTime: new Date("2026-07-20T00:00:00Z"),
    summary: "reformat",
    removed: "search for markers.",
    added: "Search for markers.",
  };
  const result = effectiveDate(
    { file: "doc.md", startLine: 1, endLine: 1 },
    makeDeps({ commits: [first, second] }),
  );
  assert.equal(result.verdict, "cosmetic-only");
  assert.equal(result.sha, "sha2");
  assert.equal(result.date.toISOString(), second.authorTime.toISOString());
  assert.deepEqual(result.skipped, [{ sha: "sha1", summary: "reformat again" }]);
});

test("effectiveDate returns unknown on empty history", () => {
  const result = effectiveDate({ file: "doc.md", startLine: 1, endLine: 1 }, makeDeps({ commits: [] }));
  assert.deepEqual(result, { date: null, sha: null, summary: null, skipped: [], verdict: "unknown" });
});

test("effectiveDate returns uncommitted for a dirty file", () => {
  const result = effectiveDate(
    { file: "doc.md", startLine: 1, endLine: 1 },
    makeDeps({ commits: [{ sha: "x", authorTime: new Date(), summary: "s", removed: "a", added: "b" }], diffOutput: "doc.md\n" }),
  );
  assert.deepEqual(result, { date: null, sha: null, summary: null, skipped: [], verdict: "uncommitted" });
});
