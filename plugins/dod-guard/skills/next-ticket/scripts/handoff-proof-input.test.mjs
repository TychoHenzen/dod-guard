import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { fixture, run, withTempFile } from "./testing/handoff-proof-harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CORRECTED = fixture("issue-855-shape-corrected-body.md");

test("passes linked functional-slice children from --children", async () => {
  await withTempFile("children.json", '[{"id": "orphan-slice", "evidence": "slice-proof"}]', (children) => {
    assert.deepEqual(run("refinement", `--body-file=${CORRECTED}`, `--children=${children}`), {
      status: 1,
      json: { outcome: "actionable remainder", remainder: ["orphan-slice slice needs an owning task"] },
    });
  });
});

test("exits 2 and names the record on a body it cannot parse", async () => {
  const body = await readFile(CORRECTED, "utf8");
  const withoutPlanned = body.replace("### planned-acceptance-matrix\n", "### planned-matrix\n");
  await withTempFile("body.md", withoutPlanned, (file) => {
    assert.deepEqual(run("refinement", `--body-file=${file}`), {
      status: 2,
      json: { outcome: "parse error", remainder: ["missing planned-acceptance-matrix record"] },
    });
  });
  const withoutEvidence = body.replace("### acceptance-evidence\n", "### evidence\n");
  await withTempFile("body.md", withoutEvidence, (file) => {
    assert.deepEqual(run("refinement", `--body-file=${file}`), {
      status: 2,
      json: { outcome: "parse error", remainder: ["missing acceptance-evidence record"] },
    });
  });
  const invalidTasks = body.replace('[\n  {"id":"T1"', '[\n  {"id":"T1",,');
  await withTempFile("body.md", invalidTasks, (file) => {
    assert.deepEqual(run("refinement", `--body-file=${file}`), {
      status: 2,
      json: { outcome: "parse error", remainder: ["task-list record is not valid JSON"] },
    });
  });
});

test("exits 2 on a usage error and names the argument", async () => {
  const usage = (remainder) => ({ status: 2, json: { outcome: "usage error", remainder } });
  const missing = path.join(here, "fixtures", "no-such-body.md");

  assert.deepEqual(run("refinement"), usage(["--body-file=<path> is required"]));
  const subcommandError = ["the first argument must be the refinement, post-push, or finalization subcommand"];
  assert.deepEqual(run(), usage(subcommandError));
  assert.deepEqual(run("finalize", `--body-file=${CORRECTED}`), usage(subcommandError));
  assert.deepEqual(run("constructor", `--body-file=${CORRECTED}`), usage(subcommandError));
  assert.deepEqual(run("refinement", CORRECTED), usage([`unexpected argument ${CORRECTED}`]));
  assert.deepEqual(run("refinement", `--body-file=${CORRECTED}`, "--head=abc"), usage(["unknown option --head"]));
  assert.deepEqual(run("refinement", `--body-file=${missing}`), usage([`cannot read --body-file ${missing}`]));
  await withTempFile("children.json", '{"id": "slice"}', (children) => {
    assert.deepEqual(
      run("refinement", `--body-file=${CORRECTED}`, `--children=${children}`),
      usage(["--children file must hold a JSON array"]),
    );
  });
});
