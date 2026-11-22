import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fixture, run, withFiles } from "./testing/handoff-proof-harness.mjs";

const RECOVERY = '"evidence":"ev-path-recovery","expected":"recovery behaves as planned"';
const PLAN = "## Step plan: T1\n\n```text\nFile: lib/a.mjs\n```\n";
const WINDOWED = "windowed screenshot of the recovered shelf";
const HEADLESS =
  "scripted input; set GetTree().Root.Size to the window size; no window opens and no screenshot is taken";
const FIX = "make it checkable headless, or move the judgement to an owner note";
const FLAGGED = {
  status: 1,
  json: {
    outcome: "actionable remainder",
    remainder: [`planned acceptance row R7 asks for a windowed run and a screenshot in a Godot project; ${FIX}`],
  },
};
const VERIFIED = { status: 0, json: { outcome: "verified", remainder: [] } };

async function withRoot(isGodot, use) {
  const root = await mkdtemp(path.join(tmpdir(), "handoff-proof-godot-"));
  try {
    await mkdir(path.join(root, "lib"));
    await writeFile(path.join(root, "lib", "a.mjs"), "alpha\n");
    if (isGodot) await writeFile(path.join(root, "project.godot"), "config_version=5\n");
    return await use(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function refine(expected, isGodot) {
  const base = await readFile(fixture("issue-855-shape-corrected-body.md"), "utf8");
  const body = base.replace(RECOVERY, `"evidence":"ev-path-recovery","expected":"${expected}"`);
  assert.notEqual(body, base);
  const files = [
    ["body.md", body],
    ["plans.md", PLAN],
  ];
  return withRoot(isGodot, (root) =>
    withFiles(files, ([bodyFile, plansFile]) =>
      run("refinement", `--body-file=${bodyFile}`, `--plans=${plansFile}`, `--root=${root}`),
    ),
  );
}

test("fails a windowed screenshot row in a Godot checkout and names the row", async () => {
  assert.deepEqual(await refine(WINDOWED, true), FLAGGED);
});

test("verifies a headless row in a Godot checkout", async () => {
  assert.deepEqual(await refine(HEADLESS, true), VERIFIED);
});

test("does not judge the same windowed row in a checkout without project.godot", async () => {
  assert.deepEqual(await refine(WINDOWED, false), VERIFIED);
});

test("clears the finding once the flagged row is rewritten as a headless row", async () => {
  assert.equal((await refine(WINDOWED, true)).status, 1);
  assert.equal((await refine(HEADLESS, true)).status, 0);
});
