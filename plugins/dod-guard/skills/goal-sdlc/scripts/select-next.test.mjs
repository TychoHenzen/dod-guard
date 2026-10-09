import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderCompletionRecord } from "../../complete-pr/scripts/lib/closure-records.mjs";

const REPOSITORY = "TychoHenzen/dod-guard";
const SCRIPT = fileURLToPath(new URL("./select-next.mjs", import.meta.url));

function item(number, status, parentIssue = null, linked = []) {
  return {
    id: String(number),
    content: { number, repository: REPOSITORY },
    fields: [
      { name: "Status", value: { name: status } },
      { name: "Repository", value: REPOSITORY },
      { name: "Parent issue", value: parentIssue },
      { name: "Linked pull requests", value: linked },
    ],
  };
}

function issue(number, overrides = {}) {
  return {
    number,
    state: "open",
    title: `Issue ${number}`,
    parent: null,
    children: [],
    ...overrides,
  };
}

function snapshot() {
  return {
    repository: REPOSITORY,
    defaultBranch: "master",
    today: "2026-10-08",
    items: [
      item(31, "Backlog"),
      item(517, "Todo"),
      item(518, "Todo", { number: 517 }),
    ],
    issues: [
      issue(31),
      issue(517, { children: [{ number: 518 }] }),
      issue(518, { parent: { number: 517 } }),
    ],
    pullRequests: [],
  };
}

async function selectNext(input) {
  const directory = await mkdtemp(join(tmpdir(), "select-next-"));
  const file = join(directory, "snapshot.json");
  await writeFile(file, JSON.stringify(input));
  const run = spawnSync(process.execPath, [SCRIPT, `--snapshot=${file}`], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test("selects the Todo parent and its child ahead of Backlog", async () => {
  const result = await selectNext(snapshot());
  assert.deepEqual(result.selected, {
    rootIssueNumber: 517,
    status: "Todo",
    issueNumbers: [517, 518],
  });
  const kinds = result.groups.map(({ rootIssueNumber, kind }) => [
    rootIssueNumber,
    kind,
  ]);
  assert.deepEqual(kinds, [
    [31, "eligible"],
    [517, "eligible"],
  ]);
  assert.equal(result.counts.balanced, true);
});

test("holds a group whose issue was not supplied", async () => {
  const input = snapshot();
  input.issues = input.issues.filter(({ number }) => number !== 518);
  const result = await selectNext(input);
  assert.equal(result.selected, null);
  assert.ok(result.missingEvidence.includes("issue #518"));
});

test("holds today's friction log while it collects entries", async () => {
  const input = snapshot();
  input.items = [item(900, "Backlog")];
  input.issues = [issue(900, { title: "Friction log 2026-10-08" })];
  const result = await selectNext(input);
  assert.equal(result.selected, null);
  assert.deepEqual(result.groups[0].reasons, [
    "friction log still collecting entries",
  ]);
});

test("excludes a merged delivery that carries its completion evidence", async () => {
  const input = snapshot();
  const pull = { number: 540, repository: REPOSITORY };
  input.items.push(item(444, "Done", null, [pull]));
  input.issues.push(issue(444, { state: "closed", activeCheckpoint: false }));
  input.pullRequests.push({
    ...pull,
    state: "closed",
    mergedAt: "2026-10-01T00:00:00Z",
    head: { repository: REPOSITORY, ref: "codex/444-done", sha: "head-444" },
    base: { ref: "master", sha: "base-444" },
    mergeCommit: { oid: "merge-444" },
    requiredChecks: [{ name: "build-test", bucket: "pass" }],
    trustedHeadSha: "head-444",
  });
  const result = await selectNext(input);
  const done = result.groups.find(({ rootIssueNumber }) => rootIssueNumber === 444);
  assert.deepEqual(done, { rootIssueNumber: 444, kind: "complete", reasons: [] });
  assert.equal(result.selected.rootIssueNumber, 517);
});

const CLOSURE = fileURLToPath(new URL("../../complete-pr/scripts/closure.mjs", import.meta.url));
const HEAD_831 = "e783f4269c5627f4ad10efdb97dfc12a9918da83";

// #831 (PR #836) with child #832, as /complete-pr leaves it: both closed and
// Done, each carrying the completion record, and the snapshot itself carrying
// no activeCheckpoint or trustedHeadSha.
function recordedDelivery(pendingRows = []) {
  const record = renderCompletionRecord({
    pullRequest: 836,
    mergeCommit: "8f7b04b0c735453e1487ca1fd0b7a308ccb39fee",
    trustedHeadSha: HEAD_831,
    requiredChecks: "pass",
    pendingRows,
  });
  const pull = { number: 836, repository: REPOSITORY };
  const input = snapshot();
  input.items.push(item(831, "Done", null, [pull]), item(832, "Done", { number: 831 }));
  input.issues.push(
    issue(831, { state: "closed", children: [{ number: 832 }], comments: [{ id: 1, body: record }] }),
    issue(832, { state: "closed", parent: { number: 831 }, comments: [{ id: 2, body: record }] }),
  );
  input.pullRequests.push({
    ...pull,
    state: "closed",
    mergedAt: "2026-10-08T21:59:22Z",
    head: { repository: REPOSITORY, ref: "codex/831-route-goal-sdlc-stages", sha: HEAD_831 },
    base: { ref: "master", sha: "base-831" },
    mergeCommit: { oid: "8f7b04b0c735453e1487ca1fd0b7a308ccb39fee" },
    requiredChecks: [{ name: "build-test", bucket: "pass" }],
  });
  return input;
}

async function annotated(input) {
  const directory = await mkdtemp(join(tmpdir(), "annotate-"));
  const file = join(directory, "snapshot.json");
  await writeFile(file, JSON.stringify(input));
  const run = spawnSync(process.execPath, [CLOSURE, "annotate", `--snapshot=${file}`], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test("a snapshot annotated from completion records classifies the delivery complete", async () => {
  const bare = await selectNext(recordedDelivery());
  assert.equal(bare.groups.find(({ rootIssueNumber }) => rootIssueNumber === 831).kind, "hold");
  const result = await selectNext(await annotated(recordedDelivery()));
  const done = result.groups.find(({ rootIssueNumber }) => rootIssueNumber === 831);
  assert.deepEqual(done, { rootIssueNumber: 831, kind: "complete", reasons: [] });
  assert.equal(result.selected.rootIssueNumber, 517);
});

test("a merged-pending completion record keeps the delivery held", async () => {
  const result = await selectNext(await annotated(recordedDelivery(["AC-15"])));
  const held = result.groups.find(({ rootIssueNumber }) => rootIssueNumber === 831);
  assert.equal(held.kind, "hold");
  assert.ok(held.reasons.includes("active checkpoint for issue #831 is not explicitly false"));
});

test("the command rejects a missing snapshot flag", () => {
  const usage = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /usage: select-next\.mjs --snapshot=<file\.json>/);
});
