import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: the tests start the format check as a child process
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: the tests write body files and read the stub log
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: test files live in the system temp directory
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: test paths are joined per platform
import { join, resolve } from "node:path";
import process from "node:process";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createOpenspecStub, envWithPath, readStubLog, stubFirstPath } from "../../../lib/harness/openspec-stub.mjs";

const SCRIPT = fileURLToPath(new URL("./openspec-format-check.mjs", import.meta.url));
const FIXTURE = fileURLToPath(new URL("../../../lib/fixtures/openspec-shaped-body.md", import.meta.url));

let stub;
let work;

before(() => {
  stub = createOpenspecStub();
  work = mkdtempSync(join(tmpdir(), "format-check-test-"));
});

after(() => {
  stub.remove();
  rmSync(work, { recursive: true, force: true });
});

function check(args, env) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env });
}

test("exits 0 for a valid body, prints the CLI version, and removes the temporary root", () => {
  const log = join(work, "valid.log");
  const result = check([`--body-file=${FIXTURE}`], envWithPath(stubFirstPath(stub.dir), { OPENSPEC_STUB_LOG: log }));

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^openspec 9\.9\.9-stub$/m);
  assert.match(result.stdout, /^format check: passed$/m);
  const validate = readStubLog(log).find((call) => call.args[0] === "validate");
  assert.deepEqual(validate.args, ["validate", "issue-check", "--strict", "--json", "--no-interactive"]);
  assert.ok(resolve(validate.cwd).startsWith(resolve(tmpdir())), validate.cwd);
  assert.equal(existsSync(validate.cwd), false);
});

test("exits 1 and names the requirement id of each reported error", () => {
  const result = check(
    [`--body-file=${FIXTURE}`],
    envWithPath(stubFirstPath(stub.dir), { OPENSPEC_STUB_MODE: "invalid" }),
  );

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /^format check: failed$/m);
  assert.match(
    result.stdout,
    /^- R-2 \[openspec ERROR\] card-rules\/spec\.md: ADDED "Refusal reason" must include at least one scenario$/m,
  );
});

test("exits 1 for a body the mapper rejects, even when OpenSpec accepts the mapped change", () => {
  const body = join(work, "uncited.md");
  writeFileSync(body, readFileSync(FIXTURE, "utf8").replace("(R-1, R-2) Draw at limit", "(R-1) Draw at limit"));
  const result = check([`--body-file=${body}`], envWithPath(stubFirstPath(stub.dir)));

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /^- R-2 \[mapper\] R-2 is cited by no acceptance criterion$/m);
});

test("exits 2 naming openspec when the command is missing", () => {
  const empty = mkdtempSync(join(work, "empty-path-"));
  const result = check([`--body-file=${FIXTURE}`], envWithPath(empty));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /`openspec` command could not be started/);
});

test("exits 2 for a missing or unreadable body file", () => {
  const env = envWithPath(stubFirstPath(stub.dir));

  assert.equal(check([], env).status, 2);
  assert.equal(check(["stray"], env).status, 2);
  const unreadable = check([`--body-file=${join(work, "absent.md")}`], env);
  assert.equal(unreadable.status, 2);
  assert.match(unreadable.stderr, /absent\.md/);
});
