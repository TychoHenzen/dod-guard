import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { issue855Shape } from "./structured-workflow-fixtures.mjs";
import { BODY_904, fixture, run, withTempFile } from "./testing/handoff-proof-harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
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

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

test("exits 2 on a file that is not UTF-8", async () => {
  const body = await readFile(CORRECTED, "utf8");
  const notUtf8 = [
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, "utf16le")]),
    Buffer.from(body, "utf16le"),
    Buffer.from([0x41, 0xe9, 0x0a]),
  ];
  const runOnBody = (bytes) =>
    withTempFile("body.md", bytes, (file) => ({ file, result: run("refinement", `--body-file=${file}`) }));
  for (const bytes of notUtf8) {
    const { file, result } = await runOnBody(bytes);

    assert.deepEqual(result, {
      status: 2,
      json: { outcome: "usage error", remainder: [`--body-file ${file} is not UTF-8 text; save it as UTF-8`] },
    });
  }
});

test("reads UTF-8 with a byte-order mark", async () => {
  const body = await readFile(CORRECTED, "utf8");
  await withTempFile("body.md", Buffer.concat([BOM, Buffer.from(body, "utf8")]), (file) => {
    assert.deepEqual(run("refinement", `--body-file=${file}`), {
      status: 0,
      json: { outcome: "verified", remainder: [] },
    });
  });
  const children = Buffer.concat([BOM, Buffer.from('[{"id": "orphan-slice", "evidence": "slice-proof"}]')]);
  await withTempFile("children.json", children, (file) => {
    assert.deepEqual(run("refinement", `--body-file=${CORRECTED}`, `--children=${file}`), {
      status: 1,
      json: { outcome: "actionable remainder", remainder: ["orphan-slice slice needs an owning task"] },
    });
  });
});

test("reads only local files: no network, process, or GitHub module is imported", async () => {
  const importsOf = async (name) => {
    const source = await readFile(path.join(here, name), "utf8");
    assert.doesNotMatch(source, /\bimport\(|\bfetch\(|\brequire\(/, name);
    return [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]);
  };

  assert.deepEqual(await importsOf("handoff-proof.mjs"), [
    "node:path",
    "node:process",
    "node:url",
    "./handoff-proof-cli.mjs",
    "./handoff-proof-runs.mjs",
  ]);
  assert.deepEqual(await importsOf("handoff-proof-cli.mjs"), ["node:fs", "../../../lib/args.mjs"]);
  assert.deepEqual(await importsOf("handoff-proof-runs.mjs"), [
    "../../../lib/handoff-matrix.mjs",
    "../../../lib/issue-body-records.mjs",
    "../../../lib/preflight-checkpoint.mjs",
    "../../complete-pr/scripts/finalization-gate.mjs",
    "./structured-workflow-proof.mjs",
  ]);
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
