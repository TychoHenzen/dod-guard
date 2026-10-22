import assert from "node:assert/strict";
import test from "node:test";
import { issue, item, REPOSITORY, selectNext, snapshot } from "./select-next.test-support.mjs";

test("selects the Todo parent and its child ahead of Backlog", async () => {
  const result = await selectNext(snapshot());
  assert.deepEqual(result.selected, {
    rootIssueNumber: 517,
    status: "Todo",
    issueNumbers: [517, 518],
  });
  const kinds = result.groups.map(({ rootIssueNumber, kind }) => [rootIssueNumber, kind]);
  assert.deepEqual(kinds, [
    [31, "eligible"],
    [517, "eligible"],
  ]);
  assert.equal(result.counts.balanced, true);
  assert.equal(result.queueState, "ready");
});

test("an empty selection distinguishes held work from an exhausted queue", async () => {
  const empty = { ...snapshot(), items: [], issues: [] };
  assert.equal((await selectNext(empty)).queueState, "exhausted");
  const held = snapshot();
  held.issues = [];
  const result = await selectNext(held);
  assert.equal(result.selected, null);
  assert.equal(result.queueState, "held");
});

test("a Todo root with an unreadable body is reported needs-refinement, never selected, and the queue is held", async () => {
  const input = snapshot();
  input.items = [item(40, "Todo")];
  input.issues = [issue(40, { body: "## Outcome\n\nProse only.\n" })];
  const result = await selectNext(input);
  assert.equal(result.selected, null);
  assert.equal(result.queueState, "held");
  const [group] = result.groups;
  assert.equal(group.kind, "needs-refinement");
  assert.ok(group.reasons.includes("issue #40 body has no ## Implementation notes section"), group.reasons.join("; "));
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
  assert.deepEqual(result.groups[0].reasons, ["friction log still collecting entries"]);
});

test("excludes a merged delivery that carries its completion evidence", async () => {
  const input = snapshot();
  const pull = { number: 540, repository: REPOSITORY };
  input.items.push(item(444, "Done", { linked: [pull] }));
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

test("a Todo group blocked by an open issue is held with the blocker named and the next Todo group is selected", async () => {
  const input = snapshot();
  input.items = [item(40, "Todo"), item(41, "Todo")];
  input.issues = [issue(40, { blockedBy: [{ repository: REPOSITORY, number: 250, state: "open" }] }), issue(41)];
  const result = await selectNext(input);
  assert.equal(result.selected.rootIssueNumber, 41);
  const held = result.groups.find(({ rootIssueNumber }) => rootIssueNumber === 40);
  assert.deepEqual(held, { rootIssueNumber: 40, kind: "hold", reasons: [`issue #40 is blocked by ${REPOSITORY}#250`] });
});
