import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { issue855Shape } from "./issue855-shape.mjs";
import { BODY_904, fixture, gate, run, withTempFile } from "./testing/handoff-proof-harness.mjs";

const PRE_CORRECTION = fixture("issue-855-shape-body.md");
const CORRECTED = fixture("issue-855-shape-corrected-body.md");

test("the committed #855-shape bodies hold the records of the shared fixture builder", async () => {
  for (const [file, corrected] of [
    [PRE_CORRECTION, false],
    [CORRECTED, true],
  ]) {
    const { input, errors, remainder } = parseIssueBodyRecords(await readFile(file, "utf8"));
    const expected = issue855Shape({ corrected });

    assert.deepEqual(errors, []);
    assert.deepEqual(remainder, []);
    for (const key of ["tasks", "reviewLenses", "acceptance", "plannedAcceptanceMatrix"]) {
      assert.deepEqual(input[key], expected[key], key);
    }
  }
});

test("rejects the #855 pre-correction body and accepts it after the record correction", () => {
  assert.deepEqual(run("refinement", `--body-file=${PRE_CORRECTION}`), {
    status: 1,
    json: {
      outcome: "actionable remainder",
      remainder: ["reliability review lens must cover required path(s): recovery"],
    },
  });
  assert.deepEqual(run("refinement", `--body-file=${CORRECTED}`), {
    status: 0,
    json: { outcome: "verified", remainder: [] },
  });
  assert.deepEqual(run("refinement", `--body-file=${BODY_904}`), {
    status: 0,
    json: { outcome: "verified", remainder: [] },
  });
});

test("rejects a refinement body with a requirement no criterion cites", async () => {
  const body = await readFile(BODY_904, "utf8");
  const withOrphan = body.replace(
    "- R-5 Non-goals: see Scope.\n",
    "- R-5 Non-goals: see Scope.\n- R-99 An orphan requirement.\n",
  );
  assert.notEqual(withOrphan, body, "fixture must hold the R-5 requirement line");
  await withTempFile("body.md", withOrphan, (file) => {
    assert.deepEqual(run("refinement", `--body-file=${file}`), {
      status: 1,
      json: {
        outcome: "actionable remainder",
        remainder: ["R-99 requirement is cited by no acceptance criterion"],
      },
    });
  });
});

test("applies the requirement check to refinement only", async () => {
  const body = await readFile(BODY_904, "utf8");
  const withOrphan = body.replace(
    "- R-5 Non-goals: see Scope.\n",
    "- R-5 Non-goals: see Scope.\n- R-99 An orphan requirement.\n",
  );
  await withTempFile("body.md", withOrphan, (file) => {
    const refinement = run("refinement", `--body-file=${file}`);
    assert.equal(refinement.status, 1);
    assert.ok(refinement.json.remainder.some((line) => line.includes("R-99")));
  });
  for (const subcommand of ["post-push", "finalization"]) {
    const result = await gate(subcommand, { body: withOrphan });
    assert.doesNotMatch(JSON.stringify(result.json.remainder ?? []), /R-99/, subcommand);
  }
});
