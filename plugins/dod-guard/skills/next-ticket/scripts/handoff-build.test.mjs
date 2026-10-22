// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { test } from "node:test";
import { readHandoffMatrix } from "../../../lib/handoff-matrix.mjs";
import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { runCli } from "./handoff-build.mjs";
import { BODY_TEXT, gate, HEAD_904, ROWS_904, withFiles } from "./testing/handoff-proof-harness.mjs";

function evidenceFor(overrides = {}) {
  return {
    tasks: [{ id: "T1", commit: HEAD_904, files: ["a.mjs"], result: "ok" }],
    rows: Object.fromEntries(
      ROWS_904.map((row) => [
        row.id,
        {
          observed: row.observed,
          status: row.status,
          evidence: row.evidence,
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
  evidence.rows.R1.evidence = 'said "ok" in C:\\temp\\x';
  const { code, out } = await build(evidence);
  assert.equal(code, 0);
  const row = readHandoffMatrix(out).rows.find((item) => item.id === "R1");
  assert.equal(row.evidence, 'said "ok" in C:\\temp\\x');
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
  assert.deepEqual(Object.keys(rows[0]), [
    "id",
    "contract",
    "path",
    "proof",
    "expected",
    "observed",
    "status",
    "evidence",
    "headSha",
  ]);
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
  evidence.rows.R99 = { observed: "x", status: "pass", evidence: "ev" };
  const { code, out, err } = await build(evidence);
  assert.equal(code, 1);
  assert.ok(err.includes("evidence entry R99 matches no planned row"), err);
  assert.equal(out, "");
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
