import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: the tests start the script as a child process
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: the tests build OpenSpec roots on disk
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: test roots live in the system temp directory
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: test paths are joined per platform
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { writeChangeFolder } from "../../../lib/openspec-folder.mjs";
import { bodyToChange } from "../../../lib/openspec-issue-map.mjs";

const SCRIPT = fileURLToPath(new URL("./openspec-spec-merge.mjs", import.meta.url));
const FIXTURE = fileURLToPath(new URL("../../../lib/fixtures/openspec-shaped-body.md", import.meta.url));
const LEGACY = fileURLToPath(new URL("../../../lib/fixtures/issue-904-body.md", import.meta.url));

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "spec-merge-test-"));
  mkdirSync(join(root, "openspec", "specs"), { recursive: true });
  writeFileSync(join(root, "openspec", "config.yaml"), "schema: spec-driven\n");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(...args) {
  const result = spawnSync(process.execPath, [SCRIPT, "write", ...args], { encoding: "utf8" });
  return { status: result.status, stderr: result.stderr, out: result.stdout ? JSON.parse(result.stdout) : null };
}

test("writes the change folder of a body, with no tasks.md", () => {
  const result = write(`--body-file=${FIXTURE}`, `--root=${root}`, "--name=42-hand-size-limit");
  const changeDir = join(root, "openspec", "changes", "42-hand-size-limit");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.out, { status: "written", change: "42-hand-size-limit" });
  const expected = bodyToChange(readFileSync(FIXTURE, "utf8"));
  assert.equal(readFileSync(join(changeDir, "specs", "card-rules", "spec.md"), "utf8"), expected.specs["card-rules"]);
  assert.equal(readFileSync(join(changeDir, "proposal.md"), "utf8"), expected.proposal);
  assert.equal(existsSync(join(changeDir, "tasks.md")), false);
});

test("reports skipped for a legacy body and writes nothing", () => {
  const result = write(`--body-file=${LEGACY}`, `--root=${root}`, "--name=904-ascii");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.out.status, "skipped");
  assert.equal(existsSync(join(root, "openspec", "changes")), false);
});

test("reuses a HagiCode folder that maps to the same requirements", () => {
  const change = bodyToChange(readFileSync(FIXTURE, "utf8"));
  const hagicode = join(root, "openspec", "changes", "hand-size-limit");
  writeChangeFolder(hagicode, { ...change, tasks: "## 1. Rules (slice: limit)\n\n- [x] 1.1 Enforce it\n" });
  const result = write(`--body-file=${FIXTURE}`, `--root=${root}`, "--name=42-hand-size-limit", `--change=${hagicode}`);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.out, { status: "reuse", change: "hand-size-limit" });
  assert.equal(existsSync(join(root, "openspec", "changes", "42-hand-size-limit")), false);
});

test("refuses a HagiCode folder whose requirements differ from the issue", () => {
  const change = bodyToChange(readFileSync(FIXTURE, "utf8"));
  const hagicode = join(root, "openspec", "changes", "hand-size-limit");
  const specs = { "card-rules": change.specs["card-rules"].replace("Refusal reason", "Refusal code") };
  writeChangeFolder(hagicode, { ...change, specs });
  const result = write(`--body-file=${FIXTURE}`, `--root=${root}`, "--name=42-hand-size-limit", `--change=${hagicode}`);

  assert.equal(result.status, 1);
  assert.deepEqual(result.out.status, "mismatch");
  assert.deepEqual(result.out.onlyInIssue, ["ADDED card-rules Refusal reason", "MODIFIED hand-view Draw button state"]);
  assert.deepEqual(result.out.onlyInFolder, ["ADDED card-rules Refusal code"]);
});

test("exits 2 when the checkout has no OpenSpec root", () => {
  rmSync(join(root, "openspec"), { recursive: true });
  const result = write(`--body-file=${FIXTURE}`, `--root=${root}`, "--name=42-hand-size-limit");

  assert.equal(result.status, 2);
  assert.match(result.stderr, /openspec\/config\.yaml/);
});
