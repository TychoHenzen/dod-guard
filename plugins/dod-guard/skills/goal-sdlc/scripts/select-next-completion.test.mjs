import assert from "node:assert/strict";
import test from "node:test";
import { localDate } from "../../../lib/friction-log.mjs";
import {
  FOREIGN_REPOSITORY,
  foreignItem,
  issue,
  item,
  PARENT_517,
  REPOSITORY,
  selectNext,
  snapshot,
  stdoutOf,
} from "./select-next.test-support.mjs";
import { annotated, recordedDelivery } from "./select-next-delivery.test-support.mjs";

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
      item(518, "Done", { parentIssue: PARENT_517 }),
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
