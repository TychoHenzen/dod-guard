// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("review-findings.mjs", import.meta.url));
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", shell: false });

function withDir(body) {
  const dir = mkdtempSync(join(tmpdir(), "review-label-"));
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("label writes one edit per comment that lacks its id and reports the count", () => {
  withDir((dir) => {
    const comments = join(dir, "comments.json");
    const out = join(dir, "edits.json");
    const page = [
      { id: 41, pull_request_review_id: 7, body: "**MAJOR** a" },
      { id: 42, pull_request_review_id: 7, body: "**BLOCKER** b\n\nGH-42" },
    ];
    writeFileSync(comments, JSON.stringify([page]));
    const result = run(["label", "--review-id=7", `--comments=${comments}`, `--out=${out}`]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { edits: 1, out });
    assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), [{ id: 41, body: "**MAJOR** a\n\nGH-41" }]);
  });
});

test("label without --out prints usage and exits 3", () => {
  const result = run(["label", "--review-id=7", "--comments=comments.json"]);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /review-findings\.mjs label/);
});
