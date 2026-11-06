import assert from "node:assert/strict";
import test from "node:test";
import { BODY_TEXT, run, withTempFile } from "./testing/handoff-proof-harness.mjs";
import { bodyWithLensRecords } from "./testing/handoff-proof-lens-bodies.mjs";

const PLACEHOLDER_HEAD = "0000000000000000000000000000000000000000";
const refine = (body) => withTempFile("body.md", body, (file) => run("refinement", `--body-file=${file}`));

test("refinement refuses a body whose lens-ownership entries store the placeholder head", async () => {
  const result = await refine(bodyWithLensRecords((lens) => ({ ...lens, headSha: PLACEHOLDER_HEAD })));

  assert.equal(result.status, 1);
  assert.equal(result.json.outcome, "actionable remainder");
  assert.deepEqual(result.json.remainder, [
    "lens-ownership entry implementation stores headSha; store no head",
    "lens-ownership entry wiring/usability stores headSha; store no head",
    "lens-ownership entry quality stores headSha; store no head",
    "lens-ownership entry reliability stores headSha; store no head",
  ]);
});

test("refinement accepts the body once the stored heads are removed", async () => {
  assert.deepEqual(await refine(BODY_TEXT), { status: 0, json: { outcome: "verified", remainder: [] } });
});
