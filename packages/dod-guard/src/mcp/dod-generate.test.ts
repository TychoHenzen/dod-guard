/**
 * dod_generate adapter: mocks node:child_process before importing
 * dod-generate.js (and its transitive fetch-instructions.js dependency) -
 * see the "ESM mock.module ordering" rule in the repo CLAUDE.md.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, before, beforeEach, mock, test } from "node:test";
import type * as StoreModule from "../store.js";
import type { handleDodGenerate as HandleDodGenerate } from "./dod-generate.js";

let handleDodGenerate: typeof HandleDodGenerate;
let store: typeof StoreModule;

let capturedCwd: string | undefined;
let shouldFail = false;

function targetPathFor(changeId: string): string {
  return join(os.tmpdir(), `dod-guard-generate-target-${changeId}.md`);
}

/** The JSON `openspec instructions dod --change <id> --json` would print. */
function instructionsJson(changeId: string): string {
  return JSON.stringify({
    changeName: changeId,
    artifactId: "dod",
    schemaName: "default",
    changeDir: os.tmpdir(),
    outputPath: "dod.md",
    resolvedOutputPath: targetPathFor(changeId),
    existingOutputPaths: [],
    description: "test change description",
    instruction: "",
    template: "",
    dependencies: [],
    unlocks: [],
    root: { path: os.tmpdir(), source: "test" },
  });
}

/** node:child_process fixes these four positions, so they arrive as a tuple. */
type ExecFileCall = [
  cmd: string,
  args: string[],
  opts: { cwd?: string },
  cb: (err: Error | null, result: { stdout: string; stderr: string } | null) => void,
];

/** Stand in for the openspec CLI. `shouldFail` picks which branch runs. */
function fakeExecFile(...call: ExecFileCall): void {
  const [, args, opts, cb] = call;
  capturedCwd = opts?.cwd;
  if (shouldFail) {
    cb(new Error("openspec CLI exploded"), null);
    return;
  }
  const changeId = args.join(" ").match(/--change (\S+)/)?.[1] ?? "unknown-change";
  cb(null, { stdout: instructionsJson(changeId), stderr: "" });
}

before(async () => {
  mock.module("node:child_process", {
    namedExports: { exec: mock.fn(), execFile: mock.fn(fakeExecFile) },
  });
  ({ handleDodGenerate } = await import("./dod-generate.js"));
  store = await import("../store.js");
});

let storeDir: string;

beforeEach(async () => {
  storeDir = await fs.mkdtemp(join(os.tmpdir(), "dod-guard-store-"));
  process.env.DOD_STORE_DIR = storeDir;
  shouldFail = false;
  capturedCwd = undefined;
});

afterEach(async () => {
  delete process.env.DOD_STORE_DIR;
  await fs.rm(storeDir, { recursive: true, force: true });
});

test("handleDodGenerate returns the report renderAndImportDod produced", async () => {
  const report = await handleDodGenerate({ change_id: "change-happy", cwd: os.tmpdir() });

  assert.match(report, /^DoD imported\./);
  assert.match(report, /ID: /);

  const stored = await store.findByPath(targetPathFor("change-happy"));
  assert.ok(stored, "expected the generated DoD to be registered in the store");
});

test("handleDodGenerate surfaces a fetchInstructions failure as a readable error", async () => {
  shouldFail = true;

  await assert.rejects(
    () => handleDodGenerate({ change_id: "change-broken", cwd: os.tmpdir() }),
    /openspec CLI exploded/,
  );
});

test("handleDodGenerate forwards the cwd argument to fetchInstructions unchanged", async () => {
  const targetCwd = os.tmpdir();

  await handleDodGenerate({ change_id: "change-cwd", cwd: targetCwd });

  assert.equal(capturedCwd, targetCwd);
});
