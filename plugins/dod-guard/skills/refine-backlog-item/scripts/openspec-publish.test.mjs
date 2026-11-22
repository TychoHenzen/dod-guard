import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: the tests start the publish plan as a child process
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: the tests write a change folder to disk
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: test folders live in the system temp directory
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: test paths are joined per platform
import { join } from "node:path";
import process from "node:process";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createOpenspecStub, envWithPath, stubFirstPath } from "../../../lib/harness/openspec-stub.mjs";
import { writeChangeFolder } from "../../../lib/openspec-folder.mjs";
import { bodyToChange } from "../../../lib/openspec-issue-map.mjs";

const SCRIPT = fileURLToPath(new URL("./openspec-publish.mjs", import.meta.url));
const FIXTURE = new URL("../../../lib/fixtures/openspec-shaped-body.md", import.meta.url);

const TASKS = `## 1. Domain rules (slice: hand-size-limit)

- [ ] 1.1 Refuse a draw past seven cards
- [ ] 1.2 Return the hand-full reason

## 2. Tests (slice: hand-size-limit)

- [ ] 2.1 Cover a draw at and below the limit

## 3. Docs

- [ ] 3.1 Describe the limit in the rules page
`;

let stub;
let work;
let change;

before(() => {
  stub = createOpenspecStub();
  work = mkdtempSync(join(tmpdir(), "openspec-publish-test-"));
  const mapped = bodyToChange(readFileSync(FIXTURE, "utf8"));
  change = join(work, "hand-size-limit");
  writeChangeFolder(change, { proposal: mapped.proposal, design: mapped.design, specs: mapped.specs });
  writeFileSync(join(change, "tasks.md"), TASKS);
});

after(() => {
  stub.remove();
  rmSync(work, { recursive: true, force: true });
});

function plan(args, extraEnv = {}) {
  const env = envWithPath(stubFirstPath(stub.dir), extraEnv);
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env });
  return { ...result, out: result.stdout ? JSON.parse(result.stdout) : null };
}

test("maps two tagged task groups into one slice and keeps the untagged group in the parent", () => {
  const result = plan(["plan", `--change=${change}`, "--issue=42"]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.out.status, "plan");
  assert.equal(result.out.openspecVersion, "9.9.9-stub");
  const back = bodyToChange(result.out.body);
  assert.deepEqual(back.problems, []);
  assert.deepEqual(
    back.requirements.map((entry) => `${entry.id} ${entry.operation} ${entry.capability} ${entry.name}`),
    [
      "R-1 ADDED card-rules Hand size limit",
      "R-2 ADDED card-rules Refusal reason",
      "R-3 MODIFIED hand-view Draw button state",
    ],
  );
  assert.equal(result.out.slices.length, 1);
  const [slice] = result.out.slices;
  assert.equal(slice.slice, "hand-size-limit");
  assert.equal(slice.title, "Hand size limit");
  assert.match(slice.body, /^<!-- openspec-slice: hand-size-limit -->$/m);
  assert.match(slice.body, /^Part of #42\./m);
  assert.match(slice.body, /### Domain rules\n\n- \[ \] 1\.1 Refuse a draw past seven cards\n- \[ \] 1\.2 Return/);
  assert.match(slice.body, /### Tests\n\n- \[ \] 2\.1 Cover a draw at and below the limit/);
  assert.deepEqual(result.out.parentTasks, [
    { category: "Docs", tasks: [{ id: "3.1", text: "Describe the limit in the rules page" }] },
  ]);
});

test("stops before any write and prints the errors when openspec validate rejects the folder", () => {
  const result = plan(["plan", `--change=${change}`, "--issue=42"], { OPENSPEC_STUB_MODE: "invalid" });

  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.out.status, "invalid");
  assert.equal(result.out.body, undefined);
  assert.deepEqual(result.out.issues, [
    {
      level: "ERROR",
      path: "card-rules/spec.md",
      message: 'ADDED "Refusal reason" must include at least one scenario',
    },
  ]);
});

test("prints the identical plan on a second run over an unchanged folder", () => {
  const first = plan(["plan", `--change=${change}`, "--issue=42"]);
  const second = plan(["plan", `--change=${change}`, "--issue=42"]);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.stdout, first.stdout);
});

test("exits 2 for a bad argument, a missing folder, or a missing openspec command", () => {
  assert.equal(plan(["plan", `--change=${change}`]).status, 2);
  assert.equal(plan(["write", `--change=${change}`, "--issue=42"]).status, 2);
  assert.equal(plan(["plan", `--change=${change}`, "--issue=x"]).status, 2);
  const absent = plan(["plan", `--change=${join(work, "absent")}`, "--issue=42"]);
  assert.equal(absent.status, 2);
  assert.match(absent.stderr, /absent/);

  const empty = mkdtempSync(join(work, "empty-path-"));
  const missing = spawnSync(process.execPath, [SCRIPT, "plan", `--change=${change}`, "--issue=42"], {
    encoding: "utf8",
    env: envWithPath(empty),
  });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /`openspec` command could not be started/);
});
