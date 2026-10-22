import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { issue, item, REPOSITORY, SCRIPT, selectNext, snapshot } from "./select-next.test-support.mjs";

test("AC-09: an item with no repository selects nothing and is named in missingEvidence", async () => {
  const input = snapshot();
  const bare = input.items.find(({ content }) => content.number === 31);
  delete bare.content.repository;
  bare.fields = bare.fields.filter(({ name }) => name !== "Repository");
  const result = await selectNext(input);
  assert.equal(result.selected, null);
  assert.ok(result.missingEvidence.includes("repository identity missing: Project item 31"));
  assert.equal((await selectNext(snapshot())).selected.rootIssueNumber, 517);
});

test("AC-09: two conflicting items for one issue select nothing and are named in missingEvidence", async () => {
  const input = snapshot();
  input.items.push(item(517, "Backlog"));
  const result = await selectNext(input);
  assert.equal(result.selected, null);
  assert.ok(result.missingEvidence.includes("duplicate Project item: TychoHenzen/dod-guard#517"));
  assert.equal((await selectNext(snapshot())).selected.rootIssueNumber, 517);
});

test("AC-09: an item whose issue is missing from issues selects nothing and is named in missingEvidence", async () => {
  const input = snapshot();
  input.issues = input.issues.filter(({ number }) => number !== 517);
  const result = await selectNext(input);
  assert.equal(result.selected, null);
  assert.ok(result.missingEvidence.includes("issue missing from issues: TychoHenzen/dod-guard#517"));
  assert.equal((await selectNext(snapshot())).selected.rootIssueNumber, 517);
});

const AC09 =
  "AC-09: a linked pull request missing from pullRequests selects nothing" +
  " and is named in missingEvidence";

test(AC09, async () => {
  const input = snapshot();
  const pull = { number: 540, repository: REPOSITORY };
  input.items.push(item(444, "Done", { linked: [pull] }));
  input.issues.push(issue(444, { state: "closed", activeCheckpoint: false }));
  const result = await selectNext(input);
  assert.equal(result.selected, null);
  assert.ok(result.missingEvidence.includes("pull request missing from pullRequests: TychoHenzen/dod-guard#540"));
  input.pullRequests.push({
    ...pull,
    state: "open",
    head: { repository: REPOSITORY, ref: "codex/444-done", sha: "head-444" },
    base: { ref: "master", sha: "base-444" },
  });
  assert.equal((await selectNext(input)).selected.rootIssueNumber, 517);
});

test("the command rejects a missing snapshot flag", () => {
  const usage = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /usage: select-next\.mjs --snapshot=<file\.json>/);
});
