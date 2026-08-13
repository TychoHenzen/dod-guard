import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../cli.js";

// These scenarios run against this repo's own openspec/ tree, not a temp
// dir: `dod-guard steps` resolves tasks.md through the real `openspec` CLI
// (fetchInstructions/fetchStatus), which only recognizes a change under
// openspec/changes/ inside an actual OpenSpec project. Each fixture change
// gets its own id and is removed in the test's own after hook.

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const CHANGES_DIR = path.join(REPO_ROOT, "openspec", "changes");

function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { write: (s: string) => out.push(s), writeErr: (s: string) => err.push(s) },
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

async function readStepsJson(changeId: string): Promise<{ steps: unknown[]; [key: string]: unknown }> {
  const raw = await fs.readFile(path.join(CHANGES_DIR, changeId, "steps.json"), "utf-8");
  return JSON.parse(raw);
}

async function writeChangeDir(changeId: string, tasksMd: string): Promise<void> {
  await fs.mkdir(path.join(CHANGES_DIR, changeId), { recursive: true });
  await fs.writeFile(path.join(CHANGES_DIR, changeId, "tasks.md"), tasksMd, "utf-8");
}

async function removeChangeDir(changeId: string): Promise<void> {
  await fs.rm(path.join(CHANGES_DIR, changeId), { recursive: true, force: true });
}

// covers: dod-guard/steps-generation :: steps subcommand writes the change's plan :: A change with tasks gains a plan
test("writes steps.json at the OpenSpec-resolved path for a change with tasks", async () => {
  const changeId = "__steps_cli_test_basic__";
  await writeChangeDir(changeId, "## 1. Section\n\n- [ ] 1.1 First task\n");
  try {
    const { io } = captureIo();
    const code = await runCli(["steps", changeId, `--cwd=${REPO_ROOT}`], io);
    assert.equal(code, 0);
    const plan = await readStepsJson(changeId);
    assert.equal(plan.steps.length, 1);
  } finally {
    await removeChangeDir(changeId);
  }
});

// covers: dod-guard/steps-generation :: steps subcommand writes the change's plan :: The plan carries its own staleness signal
test("steps.json holds goal, cwd, plan_source, and plan_artifacts from openspec status", async () => {
  const changeId = "__steps_cli_test_staleness__";
  await writeChangeDir(changeId, "## 1. Section\n\n- [ ] 1.1 First task\n");
  try {
    const { io } = captureIo();
    await runCli(["steps", changeId, `--cwd=${REPO_ROOT}`], io);
    const plan = await readStepsJson(changeId);
    assert.equal(plan.plan_source, changeId);
    assert.equal(plan.cwd, REPO_ROOT);
    assert.ok(Array.isArray(plan.plan_artifacts) && plan.plan_artifacts.length > 0);
    assert.ok(typeof plan.goal === "string" && (plan.goal as string).length > 0);
  } finally {
    await removeChangeDir(changeId);
  }
});

// covers: dod-guard/steps-generation :: an unbound task becomes a manual step :: A change mixes bound and unbound tasks
test("a task with no covers annotation becomes a manual step alongside a bound one", async () => {
  const changeId = "__steps_cli_test_mixed__";
  await writeChangeDir(changeId, ["## 1. Section", "", "- [ ] 1.1 No annotation here"].join("\n"));
  try {
    const { io } = captureIo();
    await runCli(["steps", changeId, `--cwd=${REPO_ROOT}`], io);
    const plan = await readStepsJson(changeId);
    const [step] = plan.steps as Array<{ manual_required: boolean; verify_cmd: string }>;
    assert.equal(step.manual_required, true);
    assert.equal(step.verify_cmd, "");
  } finally {
    await removeChangeDir(changeId);
  }
});

// covers: dod-guard/steps-generation :: a task binds to a scenario through an annotation :: An annotated task naming an unwired scenario stays manual
test("a covers annotation naming a scenario no test binds stays manual", async () => {
  const changeId = "__steps_cli_test_unwired__";
  await writeChangeDir(
    changeId,
    [
      "## 1. Section",
      "",
      "- [ ] 1.1 Names a scenario nothing binds",
      "<!-- covers: dod-guard/steps-generation :: a task item becomes a verified step :: no such scenario -->",
    ].join("\n"),
  );
  try {
    const { io } = captureIo();
    await runCli(["steps", changeId, `--cwd=${REPO_ROOT}`], io);
    const plan = await readStepsJson(changeId);
    const [step] = plan.steps as Array<{ manual_required: boolean; verify_cmd: string }>;
    assert.equal(step.manual_required, true);
    assert.equal(step.verify_cmd, "");
  } finally {
    await removeChangeDir(changeId);
  }
});

// covers: dod-guard/steps-generation :: a task item becomes a verified step :: Tasks convert in order
test("two sections of two items each convert into four steps in source order", async () => {
  const changeId = "__steps_cli_test_order__";
  await writeChangeDir(
    changeId,
    ["## 1. First", "", "- [ ] 1.1 A", "- [ ] 1.2 B", "", "## 2. Second", "", "- [ ] 2.1 C", "- [ ] 2.2 D"].join(
      "\n",
    ),
  );
  try {
    const { io } = captureIo();
    await runCli(["steps", changeId, `--cwd=${REPO_ROOT}`], io);
    const plan = await readStepsJson(changeId);
    const steps = plan.steps as Array<{ id: string; deps: string[] }>;
    assert.deepEqual(
      steps.map((s) => s.id),
      ["1.1", "1.2", "2.1", "2.2"],
    );
    assert.deepEqual(steps[1].deps, ["1.1"]);
    assert.deepEqual(steps[2].deps, ["1.2"]);
    assert.deepEqual(steps[3].deps, ["2.1"]);
  } finally {
    await removeChangeDir(changeId);
  }
});

// covers: dod-guard/steps-generation :: fields a machine cannot know are left for judgment :: A generated step is inspected before editing
test("a generated step has empty files, code surface, and pending status", async () => {
  const changeId = "__steps_cli_test_fields__";
  await writeChangeDir(changeId, "## 1. Section\n\n- [ ] 1.1 Some task\n");
  try {
    const { io } = captureIo();
    await runCli(["steps", changeId, `--cwd=${REPO_ROOT}`], io);
    const plan = await readStepsJson(changeId);
    const [step] = plan.steps as Array<{ files: unknown[]; verify_surface: string; status: string }>;
    assert.deepEqual(step.files, []);
    assert.equal(step.verify_surface, "code");
    assert.equal(step.status, "pending");
  } finally {
    await removeChangeDir(changeId);
  }
});

// covers: dod-guard/steps-generation :: exit codes match the cover subcommand :: The change has no tasks
test("exits 3 when the change has no tasks.md", async () => {
  const changeId = "__steps_cli_test_notasks__";
  await fs.mkdir(path.join(CHANGES_DIR, changeId), { recursive: true });
  try {
    const { io, err } = captureIo();
    const code = await runCli(["steps", changeId, `--cwd=${REPO_ROOT}`], io);
    assert.equal(code, 3);
    assert.match(err(), /no tasks\.md/);
  } finally {
    await removeChangeDir(changeId);
  }
});

// The bound-test scenario needs a real marker + entry-point-free group so
// `dod-guard cover` reaches a real covered-* outcome, not a mock - matching
// reachability.test.ts's own precedent. `tools/openspec-dashboard` has no
// tsc build step, so the fixture test file is runnable as written.

const FIXTURE_DIR = path.join(REPO_ROOT, "tools", "openspec-dashboard", "__steps_cli_bound_fixture__");
const FIXTURE_TEST_FILE = path.join(FIXTURE_DIR, "sample.test.js");
const BOUND_CHANGE_ID = "__steps_cli_test_bound__";

before(async () => {
  await fs.mkdir(FIXTURE_DIR, { recursive: true });
  await fs.writeFile(
    FIXTURE_TEST_FILE,
    [
      'import assert from "node:assert/strict";',
      'import { test } from "node:test";',
      "",
      "// covers: openspec-dashboard/steps-cli-fixture :: fixture requirement :: fixture scenario",
      'test("the bound fixture test", () => {',
      "  assert.equal(1 + 1, 2);",
      "});",
      "",
    ].join("\n"),
  );
  await fs.mkdir(path.join(CHANGES_DIR, BOUND_CHANGE_ID, "specs", "openspec-dashboard", "steps-cli-fixture"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(CHANGES_DIR, BOUND_CHANGE_ID, "tasks.md"),
    [
      "## 1. Section",
      "",
      "- [ ] 1.1 Do the bound thing",
      "<!-- covers: openspec-dashboard/steps-cli-fixture :: fixture requirement :: fixture scenario -->",
    ].join("\n"),
    "utf-8",
  );
  await fs.writeFile(
    path.join(CHANGES_DIR, BOUND_CHANGE_ID, "specs", "openspec-dashboard", "steps-cli-fixture", "spec.md"),
    [
      "## Purpose",
      "",
      "Fixture.",
      "",
      "## ADDED Requirements",
      "",
      "### Requirement: fixture requirement",
      "",
      "#### Scenario: fixture scenario",
      "- **WHEN** something",
      "- **THEN** something else",
    ].join("\n"),
    "utf-8",
  );
});

after(async () => {
  await fs.rm(FIXTURE_DIR, { recursive: true, force: true });
  await removeChangeDir(BOUND_CHANGE_ID);
});

// covers: dod-guard/steps-generation :: a task binds to a scenario through an annotation :: An annotated task resolves its bound test
test("a covers annotation naming a covered scenario gets its bound test as verify_cmd", async () => {
  const { io } = captureIo();
  const code = await runCli(["steps", BOUND_CHANGE_ID, `--cwd=${REPO_ROOT}`], io);
  assert.equal(code, 0);
  const plan = await readStepsJson(BOUND_CHANGE_ID);
  const [step] = plan.steps as Array<{ manual_required: boolean; verify_cmd: string }>;
  assert.equal(step.manual_required, false);
  assert.match(step.verify_cmd, /tools\/openspec-dashboard\/__steps_cli_bound_fixture__\/sample\.test\.js/);
});
