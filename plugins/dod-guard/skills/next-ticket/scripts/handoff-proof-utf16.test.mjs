import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BODY_TEXT,
  buildHandoff,
  fixture,
  HEAD_904,
  ROWS_904,
  run,
  withFiles,
  withTempFile,
} from "./testing/handoff-proof-harness.mjs";

const CORRECTED = fixture("issue-855-shape-corrected-body.md");
const HANDOFF_TEXT = buildHandoff(ROWS_904);
const SAVED = [
  ["body.md", BODY_TEXT],
  ["handoff.md", HANDOFF_TEXT],
];

test("reads UTF-16 with a byte-order mark, as Windows PowerShell 5.1 writes", async () => {
  const body = await readFile(CORRECTED, "utf8");
  const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  await withTempFile("body.md", utf16(body), (file) => {
    assert.deepEqual(run("refinement", `--body-file=${file}`), {
      status: 0,
      json: { outcome: "verified", remainder: [] },
    });
  });
  await withTempFile("children.json", utf16('[{"id": "orphan-slice", "evidence": "slice-proof"}]'), (file) => {
    assert.deepEqual(run("refinement", `--body-file=${CORRECTED}`, `--children=${file}`), {
      status: 1,
      json: { outcome: "actionable remainder", remainder: ["orphan-slice slice needs an owning task"] },
    });
  });
});

test("finalization reads a handoff saved as UTF-16 with a byte-order mark like the plain one", async () => {
  const marked = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(HANDOFF_TEXT, "utf16le")]);
  await withFiles([...SAVED, ["handoff-utf16-bom.md", marked]], ([body, handoff, handoffMarked]) => {
    const finalization = (handoffFile) =>
      run("finalization", `--body-file=${body}`, `--handoff-file=${handoffFile}`, `--head-sha=${HEAD_904}`);

    assert.deepEqual(finalization(handoffMarked), finalization(handoff));
  });
});
