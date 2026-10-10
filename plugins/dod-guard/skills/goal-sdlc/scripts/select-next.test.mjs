import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { localDate } from "../../../lib/friction-log.mjs";
import { renderCompletionRecord } from "../../complete-pr/scripts/lib/closure-records.mjs";

const REPOSITORY = "TychoHenzen/dod-guard";
const FOREIGN_REPOSITORY = "other/repo";
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
    repository: REPOSITORY,
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
      item(518, "Todo", { repository: REPOSITORY, number: 517 }),
    ],
    issues: [
      issue(31),
      issue(517, { children: [{ repository: REPOSITORY, number: 518 }] }),
      issue(518, { parent: { repository: REPOSITORY, number: 517 } }),
    ],
    pullRequests: [],
  };
}

// Runs the command on one snapshot and returns its raw stdout, so a test can compare bytes.
async function stdoutOf(input) {
  const directory = await mkdtemp(join(tmpdir(), "select-next-"));
  const file = join(directory, "snapshot.json");
  await writeFile(file, JSON.stringify(input));
  const run = spawnSync(process.execPath, [SCRIPT, `--snapshot=${file}`], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

async function selectNext(input) {
  return JSON.parse(await stdoutOf(input));
}

// An item of another repository. Its number may match a target record's, and its fields name the
// other repository, so it must never be read as a target item.
function foreignItem(number, status, parentIssue = null) {
  return {
    id: `foreign-${number}`,
    content: { number, repository: FOREIGN_REPOSITORY },
    fields: [
      { name: "Status", value: { name: status } },
      { name: "Repository", value: FOREIGN_REPOSITORY },
      { name: "Parent issue", value: parentIssue },
      { name: "Linked pull requests", value: [] },
    ],
  };
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
  assert.ok(result.missingEvidence.includes("issue missing from issues: TychoHenzen/dod-guard#518"));
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
  input.items.push(item(831, "Done", null, [pull]), item(832, "Done", { repository: REPOSITORY, number: 831 }));
  input.issues.push(
    issue(831, {
      state: "closed",
      repository: REPOSITORY,
      children: [{ repository: REPOSITORY, number: 832 }],
      comments: [{ id: 1, body: record }],
    }),
    issue(832, {
      state: "closed",
      repository: REPOSITORY,
      parent: { repository: REPOSITORY, number: 831 },
      comments: [{ id: 2, body: record }],
    }),
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

test("AC-02: a foreign item and issue numbered like a target root select the same root in either order", async () => {
  const target = snapshot();
  const foreignIssue = issue(517, { repository: FOREIGN_REPOSITORY, state: "closed", title: "Foreign 517" });
  const foreignFirst = await stdoutOf({
    ...target,
    items: [foreignItem(517, "Done"), ...target.items],
    issues: [foreignIssue, ...target.issues],
  });
  const foreignLast = await stdoutOf({
    ...target,
    items: [...target.items, foreignItem(517, "Done")],
    issues: [...target.issues, foreignIssue],
  });
  assert.equal(foreignFirst, foreignLast);
  assert.deepEqual(JSON.parse(foreignFirst).selected, {
    rootIssueNumber: 517,
    status: "Todo",
    issueNumbers: [517, 518],
  });
});

test("AC-05: foreign Done items are left out of the parent and child Done counts", async () => {
  const input = {
    repository: REPOSITORY,
    defaultBranch: "master",
    today: "2026-10-08",
    items: [
      item(517, "Todo"),
      item(518, "Done", { repository: REPOSITORY, number: 517 }),
      foreignItem(600, "Done"),
      foreignItem(601, "Done", { repository: FOREIGN_REPOSITORY, number: 600 }),
    ],
    issues: [
      issue(517, { children: [{ repository: REPOSITORY, number: 518 }] }),
      issue(518, { state: "closed", parent: { repository: REPOSITORY, number: 517 } }),
    ],
    pullRequests: [],
  };
  const result = await selectNext(input);
  assert.equal(result.counts.rawItems, 2);
  assert.equal(result.counts.parentDoneItems, 0);
  assert.equal(result.counts.childDoneItems, 1);
});

test("AC-05: with snapshot.today present, it is used", async () => {
  const input = snapshot();
  input.today = "2026-10-07";
  input.items = [item(900, "Backlog")];
  input.issues = [issue(900, { title: "Friction log 2026-10-08" })];
  const result = await selectNext(input);
  assert.deepEqual(result.groups[0].reasons, ["friction log still collecting entries"]);
});

test("AC-05: without today the CLI reads the local date at its own boundary", async () => {
  const input = snapshot();
  delete input.today;
  input.items = [item(900, "Backlog")];
  input.issues = [issue(900, { title: `Friction log ${localDate(new Date())}` })];
  const result = await selectNext(input);
  assert.deepEqual(result.groups[0].reasons, ["friction log still collecting entries"]);
});

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

test("AC-09: a linked pull request missing from pullRequests selects nothing and is named in missingEvidence", async () => {
  const input = snapshot();
  const pull = { number: 540, repository: REPOSITORY };
  input.items.push(item(444, "Done", null, [pull]));
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
