// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { fileURLToPath } from "node:url";
import { pbiJson } from "./review-pr.test-support.mjs";

const SCRIPT = fileURLToPath(new URL("../review-findings.mjs", import.meta.url));
const run = (args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    shell: false,
  });

function withDir(body) {
  const dir = mkdtempSync(join(tmpdir(), "review-findings-"));
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function write(dir, name, value) {
  const path = join(dir, name);
  writeFileSync(path, typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  return path;
}

const DIFF = [
  "diff --git a/src/a.mjs b/src/a.mjs",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/a.mjs",
  "@@ -0,0 +1 @@",
  "+x",
  "",
].join("\n");
const PBI_JSON = pbiJson();

function inputs(dir) {
  return {
    diff: write(dir, "unified0.diff", DIFF),
    pbi: write(dir, "pbi.json", PBI_JSON),
    subs: write(dir, "sub-issues.json", [[]]),
    out: join(dir, "slots.json"),
  };
}

export { inputs, PBI_JSON, run, withDir, write };
