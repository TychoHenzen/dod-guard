// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { test } from "node:test";
import { ACCEPTANCE_MATRIX_FIELDS } from "../../../lib/acceptance-matrix.mjs";
import { readHandoffMatrix } from "../../../lib/handoff-matrix.mjs";
import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { runCli } from "./handoff-build.mjs";
import { BODY_TEXT, gate, HEAD_904, ROWS_904, withFiles } from "./testing/handoff-proof-harness.mjs";

const TASK_IDS = ["T1", "T2", "T3", "T4"];

// Only what was observed: the planned rows own every identity field, evidence ids included.
function evidenceFor(overrides = {}) {
  return {
    tasks: TASK_IDS.map((id) => ({ id, commit: HEAD_904, files: [`${id}.mjs`], result: "ok" })),
    rows: Object.fromEntries(
      ROWS_904.map((row) => [
        row.id,
        {
          observed: row.observed,
          status: row.status,
          ...(Object.hasOwn(row, "reason") && { reason: row.reason }),
        },
      ]),
    ),
    ...overrides,
  };
}

async function build(evidence, body = BODY_TEXT) {
  let out = "";
  let err = "";
  const io = {
    stdout: {
      write: (chunk) => {
        out += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        err += chunk;
      },
    },
  };
  const code = await withFiles(
    [
      ["body.md", body],
      ["evidence.json", JSON.stringify(evidence)],
    ],
    ([bodyFile, evidenceFile]) =>
      runCli([`--body-file=${bodyFile}`, `--evidence-file=${evidenceFile}`, `--head-sha=${HEAD_904}`], io),
  );
  return { code, out, err };
}

test("prints a matrix block that parses for quotes and backslashes", async () => {
  const evidence = evidenceFor();
  evidence.rows.R1.observed = 'said "ok" in C:\\temp\\x';
  const { code, out } = await build(evidence);
  assert.equal(code, 0);
  const row = readHandoffMatrix(out).rows.find((item) => item.id === "R1");
  assert.equal(row.observed, 'said "ok" in C:\\temp\\x');
});

test("output passes post-push", async () => {
  const { out } = await build(evidenceFor());
  const result = await gate("post-push", { handoff: out });
  assert.equal(result.status, 0);
  assert.equal(result.json.outcome, "verified");
});

test("orders the row keys", async () => {
  const { out } = await build(evidenceFor());
  const planned = parseIssueBodyRecords(BODY_TEXT).input.plannedAcceptanceMatrix;
  const { rows } = readHandoffMatrix(out);
  assert.equal(rows.length, planned.length);
  assert.deepEqual(Object.keys(rows[0]), ACCEPTANCE_MATRIX_FIELDS);
});

test("names a planned row with no evidence", async () => {
  const evidence = evidenceFor();
  evidence.rows = Object.fromEntries(Object.entries(evidence.rows).filter(([id]) => id !== "R1"));
  const { code, out, err } = await build(evidence);
  assert.equal(code, 1);
  assert.ok(err.includes("row R1 has no evidence entry"), err);
  assert.equal(out, "");
});

test("names an evidence entry that matches no row", async () => {
  const evidence = evidenceFor();
  evidence.rows.R99 = { observed: "x", status: "pass" };
  const { code, out, err } = await build(evidence);
  assert.equal(code, 1);
  assert.ok(err.includes("evidence entry R99 matches no planned row"), err);
  assert.equal(out, "");
});

test("takes every identity field and the evidence id from the planned row", async () => {
  const planned = parseIssueBodyRecords(BODY_TEXT).input.plannedAcceptanceMatrix;
  const { out } = await build(evidenceFor());
  for (const [at, row] of readHandoffMatrix(out).rows.entries()) {
    const { id, contract, path, proof, expected, evidence } = planned[at];
    assert.deepEqual({ id: row.id, contract: row.contract, path: row.path }, { id, contract, path });
    assert.deepEqual([row.proof, row.expected, row.evidence], [proof, expected, evidence]);
  }
});

test("refuses an identity field in the evidence file", async () => {
  const evidence = evidenceFor();
  Object.assign(evidence.rows.R1, { id: "R9", evidence: "ev-made-up", proof: "x" });
  Object.assign(evidence.tasks[0], { child: "made-up" });
  const { code, out, err } = await build(evidence);
  assert.equal(code, 1);
  assert.ok(err.includes("row R1 entry field evidence comes from the plan, not the evidence file"), err);
  assert.ok(err.includes("row R1 entry field id comes from the plan"), err);
  assert.ok(err.includes("task T1 entry field child comes from the plan"), err);
  assert.equal(out, "");
});

test("names a malformed row or task entry", async () => {
  const evidence = evidenceFor();
  evidence.rows.R1.observed = " ";
  evidence.rows.R2.status = "done";
  evidence.tasks[1].files = [];
  evidence.tasks.pop();
  evidence.tasks.push({ id: "T9", commit: "c", files: ["a"], result: "r" });
  const { code, err } = await build(evidence);
  assert.equal(code, 1);
  for (const message of [
    "row R1 entry needs a non-empty observed",
    "row R2 entry status must be one of",
    "task T2 entry needs a non-empty files list",
    "task T4 has no evidence entry",
    "task entry T9 matches no planned task",
  ]) {
    assert.ok(err.includes(message), `${message} missing from ${err}`);
  }
});

test("refuses two evidence entries for one task and builds nothing", async () => {
  const evidence = evidenceFor();
  evidence.tasks.push({ ...evidence.tasks[0], commit: "other" });
  const { code, out, err } = await build(evidence);
  assert.equal(code, 1);
  assert.ok(err.includes("task entry T1 appears more than once"), err);
  assert.equal(out, "");
});

test("names the functional slice and planned evidence ids in each task bullet", async () => {
  const title = '"title": "Print ASCII OK and FAILED lines from validate-plugins"';
  const body = BODY_TEXT.replace(`${title}, "parentLevel": "convergence"`, `${title}, "child": "ascii-lines"`);
  assert.notEqual(body, BODY_TEXT);
  const { code, out } = await build(evidenceFor(), body);
  assert.equal(code, 0);
  const bullets = out.split("\n").filter((line) => line.startsWith("- T"));
  assert.equal(bullets.length, TASK_IDS.length);
  assert.ok(bullets[0].startsWith("- T1 (slice ascii-lines): commit "), bullets[0]);
  assert.ok(bullets[0].includes("evidence ev-t1-change, ev-lens-implementation"), bullets[0]);
  assert.ok(bullets[1].startsWith("- T2 (parent-level convergence): commit "), bullets[1]);
});

test("lists the failed ids in Remainder", async () => {
  const evidence = evidenceFor();
  evidence.rows.R2.status = "failed";
  const { code, out } = await build(evidence);
  assert.equal(code, 0);
  assert.ok(out.includes("Remainder: R2"), out);
});

test("refuses an unreadable body", async () => {
  const { code, err } = await build(evidenceFor(), "## Summary\n\nno notes here\n");
  assert.equal(code, 1);
  assert.ok(err.includes("body has no ## Implementation notes section"), err);
});

test("usage", () => {
  const discard = { write: (chunk) => chunk.length };
  let err = "";
  const stderr = {
    write: (chunk) => {
      err += chunk;
    },
  };
  const none = runCli([], { stdout: discard, stderr });
  assert.equal(none, 2);
  assert.ok(err.includes("handoff-build.mjs --body-file"), err);

  err = "";
  const bare = runCli(["--head-sha"], { stdout: discard, stderr });
  assert.equal(bare, 2);
});
