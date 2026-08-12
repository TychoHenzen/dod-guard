/**
 * The 'steps' command end to end, through runCli. Needs node:child_process
 * mocked before cli.js (and openspec/fetch-instructions.js under it) load -
 * see the "ESM mock.module ordering" rule in the repo CLAUDE.md.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import type { EXIT as ExitT, runCli as RunCli } from "../cli.js";
import type * as StoreModule from "../store.js";
import type { DodDocument, TaskNode } from "../types.js";
import type { renderAndImportDod as RenderAndImportDod } from "./import-dod.js";
import type { StepsPlan } from "./steps-cli.js";
import type { OpenSpecInstructions } from "./types.js";

let runCli: typeof RunCli;
let EXIT: typeof ExitT;
let store: typeof StoreModule;
let renderAndImportDod: typeof RenderAndImportDod;

/** Set per test, read by the openspec stub at call time. */
let changeDir: string;
let storeDir: string;

const CHANGE_ID = "a-change";
const ARTIFACTS = [{ id: "dod", outputPath: "dod.md", status: "done", requires: ["specs"] }];

function instructionsFor(artifactId: string): OpenSpecInstructions {
  return {
    changeName: CHANGE_ID,
    artifactId,
    schemaName: "dod-guard-spec-driven",
    changeDir,
    planningHome: { kind: "repo", root: changeDir, changesDir: changeDir, defaultSchema: "spec-driven" },
    outputPath: artifactId === "steps" ? "steps.json" : "dod.md",
    resolvedOutputPath: join(changeDir, artifactId === "steps" ? "steps.json" : "dod.md"),
    existingOutputPaths: [],
    description: "a change under test",
    instruction: "",
    template: "",
    dependencies: [{ id: "specs", done: true, path: "specs/**/*.md", description: "" }],
    unlocks: [],
    root: { path: changeDir, source: "test" },
  };
}

type ExecFileCallback = (err: Error | null, result: { stdout: string; stderr: string }) => void;

/** Stand in for the openspec CLI. Anything else the code shells out to (the
 * `where <tool>` probe in command-check.ts) succeeds with empty stdout, so
 * every proof command counts as runnable on any host. */
function fakeOpenSpec(joined: string, cb: ExecFileCallback): void {
  if (joined.includes("openspec status")) {
    cb(null, { stdout: JSON.stringify({ artifacts: ARTIFACTS }), stderr: "" });
    return;
  }
  if (joined.includes("openspec instructions")) {
    const artifactId = joined.includes("instructions steps") ? "steps" : "dod";
    cb(null, { stdout: JSON.stringify(instructionsFor(artifactId)), stderr: "" });
    return;
  }
  cb(null, { stdout: "", stderr: "" });
}

before(async () => {
  mock.module("node:child_process", {
    namedExports: {
      // checker-vcs.ts and snapshot.ts import `exec`; mock.module replaces
      // every named export, so it has to stay present even unused here.
      exec: mock.fn(),
      execFile: mock.fn((_cmd: string, args: string[], _opts: unknown, cb: ExecFileCallback) => {
        fakeOpenSpec(args.join(" "), cb);
      }),
    },
  });
  ({ runCli, EXIT } = await import("../cli.js"));
  store = await import("../store.js");
  ({ renderAndImportDod } = await import("./import-dod.js"));
});

beforeEach(async () => {
  storeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-store-"));
  process.env.DOD_STORE_DIR = storeDir;
  changeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-change-"));
});

afterEach(async () => {
  delete process.env.DOD_STORE_DIR;
  await fs.rm(storeDir, { recursive: true, force: true });
  await fs.rm(changeDir, { recursive: true, force: true });
});

function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { write: (s: string) => out.push(s), writeErr: (s: string) => err.push(s) },
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

function concreteLeaf(id: string, title: string, command: string): TaskNode {
  return {
    id,
    title,
    refinement: "concrete",
    command,
    predicate: { type: "exit_code", value: 0 },
    description: `${title} holds`,
    category: "other",
    last_status: "pending",
  };
}

function group(id: string, title: string, children: TaskNode[]): TaskNode {
  return { id, title, refinement: "draft", children, last_status: "draft" };
}

async function registerDod(roots: TaskNode[]): Promise<DodDocument> {
  const doc: DodDocument = {
    id: store.generateId(),
    title: "A planned DoD",
    goal: "prove the plan is derived from the proofs",
    date: "2026-08-12",
    cwd: changeDir,
    markdown_path: join(changeDir, "dod.md"),
    created_at: "2026-08-12T00:00:00.000Z",
    sections: { requirements: "" },
    roots,
    amendments: [],
  };
  await store.save(doc);
  return doc;
}

async function readPlan(): Promise<StepsPlan> {
  return JSON.parse(await fs.readFile(join(changeDir, "steps.json"), "utf-8")) as StepsPlan;
}

const TWO_GROUPS = [
  group("req-0", "Build passes", [
    concreteLeaf("req-0-scenario-0", "Tests run clean", "npm test"),
    concreteLeaf("req-0-scenario-1", "Types check", "npx tsc --noEmit"),
  ]),
  group("req-1", "Plan is written", [
    concreteLeaf("req-1-scenario-0", "Plan exists", "node --test dist/x.test.js"),
    concreteLeaf("req-1-scenario-1", "Plan is fresh", "git status"),
  ]),
];

describe("runCli steps", () => {
  it("writes the plan at the path OpenSpec resolved for the steps artifact", async () => {
    await registerDod(TWO_GROUPS);
    const { io, out } = captureIo();

    const code = await runCli(["steps", CHANGE_ID], io);

    assert.equal(code, EXIT.PASS);
    assert.equal((await readPlan()).steps.length, 4);
    assert.match(out(), /steps\.json/);
  });

  it("heads the plan with the DoD's goal, the repo cwd, the change id and the artifact graph", async () => {
    await registerDod(TWO_GROUPS);

    await runCli(["steps", CHANGE_ID], captureIo().io);

    const plan = await readPlan();
    assert.equal(plan.goal, "prove the plan is derived from the proofs");
    assert.equal(plan.cwd, changeDir);
    assert.equal(plan.plan_source, CHANGE_ID);
    assert.deepEqual(plan.plan_artifacts, ARTIFACTS);
  });

  it("keeps four leaves across two groups in source order, each depending on its predecessor", async () => {
    await registerDod(TWO_GROUPS);

    await runCli(["steps", CHANGE_ID], captureIo().io);

    const { steps } = await readPlan();
    assert.deepEqual(
      steps.map((s) => s.id),
      ["req-0-scenario-0", "req-0-scenario-1", "req-1-scenario-0", "req-1-scenario-1"],
    );
    assert.deepEqual(steps[0].deps, []);
    assert.deepEqual(steps[1].deps, ["req-0-scenario-0"]);
    assert.deepEqual(steps[2].deps, ["req-0-scenario-1"]);
    assert.deepEqual(steps[3].deps, ["req-1-scenario-0"]);
    assert.equal(steps[0].verify_cmd, "npm test");
  });

  it("turns a MANUAL draft leaf into a manual step with no command to run", async () => {
    await registerDod([
      group("req-0", "Judgment needed", [
        concreteLeaf("req-0-scenario-0", "Tests run clean", "npm test"),
        {
          id: "req-0-scenario-1",
          title: "A reviewer agrees",
          refinement: "draft",
          intent: "MANUAL: a reviewer confirms the wording reads well",
          last_status: "draft",
        },
      ]),
    ]);

    await runCli(["steps", CHANGE_ID], captureIo().io);

    const manual = (await readPlan()).steps[1];
    assert.equal(manual.manual_required, true);
    assert.equal(manual.verify_cmd, "");
    assert.equal(manual.description, "a reviewer confirms the wording reads well");
  });

  it("leaves files empty, verify_surface code and status pending for a human to finish", async () => {
    await registerDod(TWO_GROUPS);

    await runCli(["steps", CHANGE_ID], captureIo().io);

    const step = (await readPlan()).steps[0];
    assert.deepEqual(step.files, []);
    assert.equal(step.verify_surface, "code");
    assert.equal(step.status, "pending");
  });

  it("titles each step with the scenario heading the spec delta declares", async () => {
    await fs.mkdir(join(changeDir, "specs"), { recursive: true });
    await fs.writeFile(
      join(changeDir, "specs", "delta.md"),
      [
        "### Requirement: The plan mirrors the spec",
        "",
        "#### Scenario: Tests run clean",
        "- **WHEN** a reader runs the suite",
        "- **THEN** `npm test` exits zero",
        "",
        "#### Scenario: Types check out",
        "- **WHEN** a reader runs the compiler",
        "- **THEN** `npx tsc --noEmit` exits zero",
        "",
      ].join("\n"),
      "utf-8",
    );
    await renderAndImportDod(instructionsFor("dod"));

    await runCli(["steps", CHANGE_ID], captureIo().io);

    assert.deepEqual(
      (await readPlan()).steps.map((s) => s.title),
      ["Tests run clean", "Types check out"],
    );
  });

  it("warns on stderr that a rewrite reset the fields only a human can fill", async () => {
    await registerDod(TWO_GROUPS);
    await runCli(["steps", CHANGE_ID], captureIo().io);

    const { io, err } = captureIo();
    const code = await runCli(["steps", CHANGE_ID], io);

    assert.equal(code, EXIT.PASS);
    assert.match(err(), /files.+verify_surface.+reset/);
  });

  it("exits ERROR when the change has no registered DoD", async () => {
    const { io, err } = captureIo();

    const code = await runCli(["steps", CHANGE_ID], io);

    assert.equal(code, EXIT.ERROR);
    assert.match(err(), new RegExp(`No DoD found for change "${CHANGE_ID}"`));
  });

  it("exits ERROR when no change id is given", async () => {
    const { io, err } = captureIo();

    const code = await runCli(["steps"], io);

    assert.equal(code, EXIT.ERROR);
    assert.match(err(), /pass a change id/);
  });
});
