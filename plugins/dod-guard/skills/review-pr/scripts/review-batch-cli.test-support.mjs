import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { after } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("review-findings.mjs", import.meta.url));
const PLAN = fileURLToPath(new URL("fixtures/pr-909/plan.json", import.meta.url));
const HEAD = "0909".repeat(10);

const dirs = [];
after(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Every test writes into its own directory, so no test reads another's output.
function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "review-batch-"));
  dirs.push(dir);
  return dir;
}

function run(command, flags) {
  return spawnSync(process.execPath, [SCRIPT, command, ...flags], { encoding: "utf8", shell: false });
}

function succeeds(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

// Cuts the fixture plan into batch files under dir/batches and returns the
// command's output.
function cut(dir) {
  return succeeds(run("batches", [`--plan=${PLAN}`, `--head=${HEAD}`, `--out-dir=${path.join(dir, "batches")}`]));
}

export const cli = { HEAD, PLAN, cut, readJson, run, scratch, succeeds };
