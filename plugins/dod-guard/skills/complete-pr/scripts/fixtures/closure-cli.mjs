// The closure CLI helpers the closure tests share: temp snapshot files, the
// captured output of runCli, the shipped plan and select-next commands, and
// the snapshot the real builder writes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runCli } from "../closure.mjs";
import { REPOSITORY } from "../lib/closure.test-support.mjs";
import { fakeRest } from "../lib/closure-snapshot.test-support.mjs";

const SCRIPT = fileURLToPath(new URL("../closure.mjs", import.meta.url));
const SELECT_NEXT = fileURLToPath(
  new URL("../../../goal-sdlc/scripts/select-next.mjs", import.meta.url),
);

async function saved(name, value) {
  const directory = await mkdtemp(join(tmpdir(), "closure-"));
  const file = join(directory, name);
  await writeFile(file, JSON.stringify(value));
  return file;
}

function capture() {
  const text = { out: "", err: "" };
  return {
    text,
    stdout: { write: (chunk) => (text.out += chunk) },
    stderr: { write: (chunk) => (text.err += chunk) },
  };
}

function shippedPlan(file) {
  const run = spawnSync(
    process.execPath,
    [SCRIPT, "plan", `--snapshot=${file}`],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

function methodOf(args) {
  return args.includes("--method") ? args[args.indexOf("--method") + 1] : "GET";
}

// Writes the snapshot through runCli(["snapshot"]) and reads the file back,
// so every later stage receives exactly what the builder wrote.
async function builtSnapshot(routes) {
  const directory = await mkdtemp(join(tmpdir(), "closure-round-trip-"));
  const file = join(directory, "snapshot.json");
  const io = capture();
  const argv = ["snapshot", `--repository=${REPOSITORY}`, `--output=${file}`];
  const code = runCli(argv, {
    runner: fakeRest(routes).runner,
    ...io,
  });
  if (code !== 0) {
    throw new Error(`closure snapshot failed: ${io.text.err}`);
  }
  return { file, snapshot: JSON.parse(await readFile(file, "utf8")) };
}

function closureJson(argv, runner) {
  const io = capture();
  if (runCli(argv, { runner, ...io }) !== 0) {
    throw new Error(`closure ${argv[0]} failed: ${io.text.err}`);
  }
  return JSON.parse(io.text.out);
}

async function selectNextOf(snapshot) {
  const file = await saved("annotated.json", snapshot);
  const run = spawnSync(
    process.execPath,
    [SELECT_NEXT, `--snapshot=${file}`],
    { encoding: "utf8" },
  );
  if (run.status !== 0) {
    throw new Error(`select-next failed: ${run.stderr}`);
  }
  return JSON.parse(run.stdout);
}

export {
  builtSnapshot,
  capture,
  closureJson,
  methodOf,
  saved,
  selectNextOf,
  shippedPlan,
};
