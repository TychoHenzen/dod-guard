import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { fixture, run, withTempFile } from "./testing/handoff-proof-harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CORRECTED = fixture("issue-855-shape-corrected-body.md");
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

test("exits 2 on a file that is not UTF-8", async () => {
  const body = await readFile(CORRECTED, "utf8");
  const notUtf8 = [Buffer.from(body, "utf16le"), Buffer.from([0x41, 0xe9, 0x0a])];
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
    "./step-plan-input.mjs",
  ]);
  assert.deepEqual(await importsOf("handoff-proof-cli.mjs"), [
    "node:fs",
    "../../../lib/args.mjs",
    "../../../lib/read-text.mjs",
  ]);
  assert.deepEqual(await importsOf("handoff-proof-runs.mjs"), [
    "../../../lib/handoff-matrix.mjs",
    "../../../lib/issue-body-records.mjs",
    "../../../lib/post-push-input.mjs",
    "../../../lib/preflight-checkpoint.mjs",
    "../../../lib/step-plan-proxy.mjs",
    "../../complete-pr/scripts/finalization-gate.mjs",
    "./structured-workflow-proof.mjs",
  ]);
});
