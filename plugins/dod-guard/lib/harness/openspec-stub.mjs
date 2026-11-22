// A stub `openspec` command for the tests of the scripts that run OpenSpec.
// It is written to a temporary directory as a Node script with two launchers,
// `openspec.cmd` for Windows and an executable `openspec` shell script for
// everywhere else, so the scripts under test find it on PATH exactly as they
// find the real CLI. OPENSPEC_STUB_MODE picks the verdict, and
// OPENSPEC_STUB_LOG, when set, receives one JSON line per call.
// biome-ignore lint/correctness/noNodejsModules: the stub is written to a temporary directory
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: the stub lives in the system temp directory
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: launcher paths are joined per platform
import { delimiter, join } from "node:path";
import process from "node:process";

const STUB_SCRIPT = `import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
if (process.env.OPENSPEC_STUB_LOG) {
  appendFileSync(process.env.OPENSPEC_STUB_LOG, JSON.stringify({ cwd: process.cwd(), args }) + "\\n");
}
if (args[0] === "--version") {
  console.log("9.9.9-stub");
  process.exit(0);
}
const invalid = process.env.OPENSPEC_STUB_MODE === "invalid";
const issues = invalid
  ? [{ level: "ERROR", path: "card-rules/spec.md", message: 'ADDED "Refusal reason" must include at least one scenario' }]
  : [];
console.log(JSON.stringify({ items: [{ id: args[1], type: "change", valid: !invalid, issues }] }));
process.exit(invalid ? 1 : 0);
`;
const EXECUTABLE = 0o755;

// Returns { dir, remove } for a directory that holds the stub and its launchers.
function createOpenspecStub() {
  const dir = mkdtempSync(join(tmpdir(), "openspec-stub-"));
  writeFileSync(join(dir, "openspec-stub.mjs"), STUB_SCRIPT);
  writeFileSync(join(dir, "openspec.cmd"), `@"${process.execPath}" "%~dp0openspec-stub.mjs" %*\r\n`);
  writeFileSync(
    join(dir, "openspec"),
    `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/openspec-stub.mjs" "$@"\n`,
  );
  chmodSync(join(dir, "openspec"), EXECUTABLE);
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

// A copy of the process environment whose PATH is `path`. Windows spells the
// variable in any case, so every spelling is replaced, not just PATH.
function envWithPath(path, extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  return { ...env, ...extra, PATH: path };
}

// PATH with the stub directory first and the rest of the system after it.
function stubFirstPath(dir) {
  const current = Object.entries(process.env).find(([key]) => key.toUpperCase() === "PATH")?.[1] ?? "";
  return [dir, current].join(delimiter);
}

function readStubLog(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export { createOpenspecStub, envWithPath, readStubLog, stubFirstPath };
