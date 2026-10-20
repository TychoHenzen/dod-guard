import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  BODY_TEXT,
  buildHandoff,
  fixture,
  gate,
  HEAD_904,
  parseError,
  ROWS_904,
  run,
  usage,
  withFiles,
} from "./testing/handoff-proof-harness.mjs";

const HANDOFF_TEXT = buildHandoff(ROWS_904);
const SAVED = [
  ["body.md", BODY_TEXT],
  ["handoff.md", HANDOFF_TEXT],
];

test("post-push exits 2 on a missing option", async () => {
  await withFiles(SAVED, ([bodyFile, handoffFile]) => {
    const noHandoff = run("post-push", `--body-file=${bodyFile}`, `--head-sha=${HEAD_904}`);
    const noHead = run("post-push", `--body-file=${bodyFile}`, `--handoff-file=${handoffFile}`);
    const refinement = run("refinement", `--body-file=${bodyFile}`, `--head-sha=${HEAD_904}`);

    assert.deepEqual(noHandoff, usage(["--handoff-file=<path> is required"]));
    assert.deepEqual(noHead, usage(["--head-sha=<sha> is required"]));
    assert.deepEqual(refinement, usage(["--head-sha only applies to post-push"]));
  });
});

test("post-push exits 2 on a handoff with no matrix block, and on one with two matrix headings", async () => {
  const noBlock = await gate("post-push", { handoff: "## Implementation handoff\n\nNo matrix block.\n" });
  const twice = await gate("post-push", { handoff: `${HANDOFF_TEXT}\n${HANDOFF_TEXT}` });

  assert.deepEqual(noBlock, parseError(["handoff has no ## Acceptance matrix section"]));
  assert.deepEqual(twice, parseError(["handoff has more than one ## Acceptance matrix section"]));
});

test("finalization exits 2 with no --head-sha or an empty one", async () => {
  await withFiles(SAVED, ([bodyFile, handoffFile]) => {
    const args = [`--body-file=${bodyFile}`, `--handoff-file=${handoffFile}`];

    assert.deepEqual(run("finalization", ...args), usage(["--head-sha=<sha> is required"]));
    assert.deepEqual(run("finalization", ...args, "--head-sha="), usage(["--head-sha=<sha> is required"]));
  });
});

test("finalization exits 2 on an ordinary-path body and names every missing record", async () => {
  const ordinary = "## Summary\n\nA plain fix.\n\n## Acceptance criteria\n\n- [ ] AC-1 It works\n";
  const result = await gate("finalization", { body: ordinary });

  assert.deepEqual(
    result,
    parseError([
      "body has no ## Implementation notes section",
      "missing requirements record",
      "missing clarifications record",
      "missing implementation-plan record",
      "missing task-list record",
      "missing lens-ownership record",
      "missing acceptance-evidence record",
      "missing planned-acceptance-matrix record",
    ]),
  );
});

test("finalization exits 2 and names a matrix block that is missing, not JSON, or not an array", async () => {
  const section = (block) => `## Implementation handoff\n\n## Acceptance matrix\n\n${block}\n`;
  const cases = [
    [section("| id | status |\n| --- | --- |\n| R1 | pass |"), "acceptance matrix has no JSON block"],
    [section('```json\n[{"id": "R1",,}]\n```'), "acceptance matrix is not valid JSON"],
    [section('```json\n{"id": "R1"}\n```'), "acceptance matrix is not a JSON array"],
    ["## Implementation handoff\n", "handoff has no ## Acceptance matrix section"],
  ];

  for (const [handoff, message] of cases) {
    assert.deepEqual(await gate("finalization", { handoff }), parseError([message]), message);
  }
});

test("finalization exits 2 and names a body or handoff that is unreadable or not UTF-8", async () => {
  const missing = path.join(fixture("."), "no-such-file");
  const utf16 = (text) => Buffer.from(text, "utf16le");
  const notUtf8 = (option, file) => usage([`--${option} ${file} is not UTF-8 text; save it as UTF-8`]);
  const files = [
    ...SAVED,
    ["body-utf16.md", utf16(BODY_TEXT)],
    ["handoff-utf16.md", utf16(HANDOFF_TEXT)],
    ["handoff-latin1.md", Buffer.from([0x41, 0xe9, 0x0a])],
  ];

  await withFiles(files, ([body, handoff, bodyUtf16, handoffUtf16, handoffLatin1]) => {
    const finalization = (bodyFile, handoffFile) =>
      run("finalization", `--body-file=${bodyFile}`, `--handoff-file=${handoffFile}`, `--head-sha=${HEAD_904}`);

    assert.deepEqual(finalization(missing, handoff), usage([`cannot read --body-file ${missing}`]));
    assert.deepEqual(finalization(body, missing), usage([`cannot read --handoff-file ${missing}`]));
    assert.deepEqual(finalization(bodyUtf16, handoff), notUtf8("body-file", bodyUtf16));
    assert.deepEqual(finalization(body, handoffUtf16), notUtf8("handoff-file", handoffUtf16));
    assert.deepEqual(finalization(body, handoffLatin1), notUtf8("handoff-file", handoffLatin1));
  });
});
