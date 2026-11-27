// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { test } from "node:test";
import { ACCEPTANCE_MATRIX_FIELDS } from "../../../lib/acceptance-matrix.mjs";
import { HANDOFF_LIMITS } from "../../../lib/handoff-limits.mjs";
import { joinPlannedRows, readHandoffMatrix } from "../../../lib/handoff-matrix.mjs";
import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { checkpointSection, readPreflightCheckpoint } from "../../../lib/preflight-checkpoint.mjs";
import { runCli } from "./handoff-build.mjs";
import {
  BODY_TEXT,
  checkpointRows,
  gate,
  HEAD_904,
  ROWS_904,
  withCheckpoint,
  withFiles,
} from "./testing/handoff-proof-harness.mjs";

const TASK_IDS = ["T1", "T2", "T3", "T4"];

// Only what was observed: the planned rows own every identity field, evidence ids included, and the
// commit names its files. Each observation is one short sentence, as the row line limit asks.
function evidenceFor(overrides = {}) {
  return {
    tasks: TASK_IDS.map((id) => ({ id, commit: HEAD_904, result: "ok" })),
    rows: Object.fromEntries(
      ROWS_904.map((row) => [
        row.id,
        {
          observed: `${row.id} was seen at the head.`,
          status: row.status,
          ...(Object.hasOwn(row, "reason") && { reason: row.reason }),
        },
      ]),
    ),
    ...overrides,
  };
}

// previous is the text of the handoff being rebuilt, or null to omit the option.
async function build(evidence, body = BODY_TEXT, previous = null) {
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
  const files = [
    ["body.md", body],
    ["evidence.json", JSON.stringify(evidence)],
  ];
  if (previous !== null) {
    files.push(["previous.md", previous]);
  }
  const code = await withFiles(files, ([bodyFile, evidenceFile, previousFile]) => {
    const args = [`--body-file=${bodyFile}`, `--evidence-file=${evidenceFile}`, `--head-sha=${HEAD_904}`];
    if (previousFile !== undefined) {
      args.push(`--previous-handoff-file=${previousFile}`);
    }
    return runCli(args, io);
  });
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

test("writes each row on one line with only what was observed, and joins back in the full key order", async () => {
  const { out } = await build(evidenceFor());
  const planned = parseIssueBodyRecords(BODY_TEXT).input.plannedAcceptanceMatrix;
  const lines = out.split("\n").filter((line) => line.startsWith('{"id":'));
  assert.equal(lines.length, planned.length);
  assert.deepEqual(Object.keys(JSON.parse(lines[0].replace(/,$/, ""))), ["id", "contract", "status", "observed"]);
  assert.ok(out.includes(`{"headSha":"${HEAD_904}","rows":[\n`), out);
  const { rows, problems } = joinPlannedRows(readHandoffMatrix(out), planned);
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(rows[0]), ACCEPTANCE_MATRIX_FIELDS);
});

test("post-push names a planned row the compact matrix lost", async () => {
  const { out } = await build(evidenceFor());
  const lost = out
    .split("\n")
    .filter((line) => !line.startsWith('{"id":"R2",'))
    .join("\n");
  assert.notEqual(lost, out);
  const result = await gate("post-push", { handoff: lost });
  assert.equal(result.status, 1);
  assert.ok(result.json.remainder.includes("planned row R2 has no acceptance matrix row"), JSON.stringify(result.json));
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
  assert.equal(out.includes(planned[0].expected), false, "the handoff does not copy the planned row");
  for (const [at, row] of joinPlannedRows(readHandoffMatrix(out), planned).rows.entries()) {
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
  evidence.tasks[1].files = ["a.mjs"];
  evidence.tasks[2].commit = "c";
  evidence.tasks.pop();
  evidence.tasks.push({ id: "T9", commit: "none", result: "r" });
  const { code, err } = await build(evidence);
  assert.equal(code, 1);
  for (const message of [
    "row R1 entry needs a non-empty observed",
    "row R2 entry status must be one of",
    "task T2 entry field files is no longer part of the handoff: the commit names its files",
    "task T3 entry commit must be a git sha of 7 to 40 hex digits, or none",
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

test("writes each task as its id, commit and result, and copies nothing the issue body holds", async () => {
  const evidence = evidenceFor();
  evidence.tasks[0].result = "Tests\npass.";
  const { code, out } = await build(evidence);
  assert.equal(code, 0);
  const bullets = out.split("\n").filter((line) => line.startsWith("- T"));
  assert.deepEqual(bullets, [
    `- T1: commit ${HEAD_904}. Tests pass.`,
    ...TASK_IDS.slice(1).map((id) => `- ${id}: commit ${HEAD_904}. ok`),
  ]);
  assert.equal(out.includes("ev-t1-change"), false);
});

test("refuses a task line or a row over its limit and cuts nothing", async () => {
  const evidence = evidenceFor();
  evidence.tasks[0].result = "r".repeat(HANDOFF_LIMITS.taskLine);
  evidence.rows.R1.observed = "o".repeat(HANDOFF_LIMITS.rowLine);
  const { code, out, err } = await build(evidence);
  assert.equal(code, 1);
  assert.equal(out, "");
  assert.match(
    err,
    /task T1 line is \d+ characters, over the 280-character limit; write it shorter, do not cut it off/,
  );
  assert.match(err, /matrix row R1 is \d+ characters, over the 280-character limit/);
});

test("refuses a body with an id longer than the handoff takes", async () => {
  const body = BODY_TEXT.replace('{"id": "R10",', '{"id": "R10-gates-and-more",');
  assert.notEqual(body, BODY_TEXT);
  const evidence = evidenceFor();
  evidence.rows["R10-gates-and-more"] = evidence.rows.R10;
  delete evidence.rows.R10;
  const { code, err } = await build(evidence, body);
  assert.equal(code, 1);
  assert.ok(err.includes("planned row id R10-gates-and-more is longer than 16 characters"), err);
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
  err = "";
  const bareOption = runCli(["--body-file=a", "--evidence-file=b", "--head-sha=c", "--previous-handoff-file"], {
    stdout: discard,
    stderr,
  });
  assert.equal(bareOption, 2);
  assert.ok(err.includes("--previous-handoff-file=<handoff.md> needs a value"), err);
});

const SHA_LENGTH = 40;
const OLD_HEAD = "a".repeat(SHA_LENGTH);
const previousHandoff = () => withCheckpoint("## Implementation handoff\n\n- old bullet\n", checkpointRows(OLD_HEAD));

test("carries the previous Preflight checkpoint section unchanged", async () => {
  const { code, out } = await build(evidenceFor(), BODY_TEXT, previousHandoff());
  assert.equal(code, 0);
  assert.deepEqual(readPreflightCheckpoint(out), { rows: checkpointRows(OLD_HEAD) });
  assert.ok(out.endsWith(checkpointSection(previousHandoff()).section), out);
});

test("a carried checkpoint is reported as bound to the old head, never as missing", async () => {
  const { out } = await build(evidenceFor(), BODY_TEXT, previousHandoff());
  const result = await gate("finalization", { handoff: out, checkpoint: null });
  assert.equal(result.status, 1);
  assert.ok(
    result.json.remainder.includes(`required context build-test is bound to ${OLD_HEAD}, expected ${HEAD_904}`),
    JSON.stringify(result.json),
  );
  assert.equal(result.json.remainder.includes("handoff has no ## Preflight checkpoint section"), false);
});

test("without a previous checkpoint the output is unchanged", async () => {
  const plain = await build(evidenceFor());
  const none = await build(evidenceFor(), BODY_TEXT, "## Implementation handoff\n\n- old bullet\n");
  assert.equal(none.code, 0);
  assert.equal(none.out, plain.out);
});

test("refuses a carried checkpoint over its limit and builds nothing", async () => {
  const long = previousHandoff().replace(
    "## Preflight checkpoint\n",
    `## Preflight checkpoint\n\n${"z".repeat(HANDOFF_LIMITS.checkpoint)}\n`,
  );
  const { code, out, err } = await build(evidenceFor(), BODY_TEXT, long);
  assert.equal(code, 1);
  assert.equal(out, "");
  assert.match(err, /the carried ## Preflight checkpoint is \d+ characters, over the 3000-character limit/);
});

test("refuses a previous handoff with two checkpoint sections and builds nothing", async () => {
  const twice = `${previousHandoff()}\n${previousHandoff()}`;
  const { code, out, err } = await build(evidenceFor(), BODY_TEXT, twice);
  assert.equal(code, 1);
  assert.equal(out, "");
  assert.ok(err.includes("handoff has more than one ## Preflight checkpoint section"), err);
});

test("the rebuilt handoff passes finalization once the carried rows are rewritten at the new head", async () => {
  const { out } = await build(evidenceFor(), BODY_TEXT, previousHandoff());
  const rewritten = out.replace(JSON.stringify(checkpointRows(OLD_HEAD)), JSON.stringify(checkpointRows(HEAD_904)));
  assert.notEqual(rewritten, out);
  const result = await gate("finalization", { handoff: rewritten, checkpoint: null });
  assert.deepEqual(result, { status: 0, json: { outcome: "verified", remainder: [] } });
});
