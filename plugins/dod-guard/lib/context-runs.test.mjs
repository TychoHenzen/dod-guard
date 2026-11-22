import assert from "node:assert/strict";
import test from "node:test";
import { collapseContextRuns } from "./context-runs.mjs";

const HEAD = "abc1234";
const base = { provider: "github-actions", workflow: "codeql.yml", ref: "codex/1165", headSha: HEAD, state: "present" };
const run = (context, event, runId) => ({ context, event, runId, ...base });
const changed = (source, extra) => ({ ...source, ...extra });
const row = (context, runId) => ({ context, runId, ...base });
const ANALYZE = "Analyze C#";

test("collapses a push run and a pull_request run of one context to the pull_request run, in either order", () => {
  const pushFirst = collapseContextRuns([run(ANALYZE, "push", 11), run(ANALYZE, "pull_request", 12)]);
  const prFirst = collapseContextRuns([run(ANALYZE, "pull_request", 12), run(ANALYZE, "push", 11)]);

  assert.deepEqual(pushFirst, { rows: [row(ANALYZE, 12)], problems: [] });
  assert.deepEqual(prFirst, { rows: [row(ANALYZE, 12)], problems: [] });
});

test("stops on two runs of one event, even beside a pull_request run", () => {
  const twoPullRequests = collapseContextRuns([run(ANALYZE, "pull_request", 11), run(ANALYZE, "pull_request", 12)]);
  const twoPushes = collapseContextRuns([
    run(ANALYZE, "push", 11),
    run(ANALYZE, "push", 12),
    run(ANALYZE, "pull_request", 13),
  ]);

  assert.deepEqual(twoPullRequests, {
    rows: [],
    problems: [`required context ${ANALYZE} has more than one pull_request run`],
  });
  assert.deepEqual(twoPushes, { rows: [], problems: [`required context ${ANALYZE} has more than one push run`] });
});

test("stops when the events have no pull_request run to cite", () => {
  const result = collapseContextRuns([run(ANALYZE, "push", 11), run(ANALYZE, "workflow_dispatch", 12)]);

  assert.deepEqual(result, {
    rows: [],
    problems: [`required context ${ANALYZE} has push and workflow_dispatch runs but no pull_request run`],
  });
});

test("stops on runs of one context from different workflows, providers, or heads", () => {
  const workflows = collapseContextRuns([
    run(ANALYZE, "push", 11),
    changed(run(ANALYZE, "pull_request", 12), { workflow: "other.yml" }),
  ]);
  const providers = collapseContextRuns([
    run(ANALYZE, "push", 11),
    changed(run(ANALYZE, "pull_request", 12), { provider: "circleci" }),
  ]);
  const heads = collapseContextRuns([
    run(ANALYZE, "push", 11),
    changed(run(ANALYZE, "pull_request", 12), { headSha: "deadbee" }),
  ]);

  assert.deepEqual(workflows.problems, [`required context ${ANALYZE} has runs from more than one workflow`]);
  assert.deepEqual(providers.problems, [`required context ${ANALYZE} has runs from more than one workflow`]);
  assert.deepEqual(heads.problems, [`required context ${ANALYZE} has runs bound to different heads`]);
});

test("passes a lone run of any event through without its event, in first-seen context order", () => {
  const result = collapseContextRuns([
    run("build-test", "push", 1),
    run(ANALYZE, "push", 11),
    run(ANALYZE, "pull_request", 12),
  ]);

  assert.deepEqual(result, { rows: [row("build-test", 1), row(ANALYZE, 12)], problems: [] });
});

test("a stopped context keeps its problem and does not hide the rows of the others", () => {
  const result = collapseContextRuns([
    run("build-test", "push", 1),
    run(ANALYZE, "pull_request", 11),
    run(ANALYZE, "pull_request", 12),
  ]);

  assert.deepEqual(result.rows, [row("build-test", 1)]);
  assert.deepEqual(result.problems, [`required context ${ANALYZE} has more than one pull_request run`]);
});

test("reports an empty list and a malformed run by position", () => {
  assert.deepEqual(collapseContextRuns([]), { rows: [], problems: ["no runs to collapse"] });
  assert.deepEqual(collapseContextRuns([run(ANALYZE, "push", 11), null]), {
    rows: [],
    problems: ["run 2 is malformed"],
  });
  assert.deepEqual(collapseContextRuns([{ context: ANALYZE }]), { rows: [], problems: ["run 1 is malformed"] });
});
