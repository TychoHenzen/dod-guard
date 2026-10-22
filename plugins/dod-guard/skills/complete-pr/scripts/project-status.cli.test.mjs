// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { fileURLToPath } from "node:url";
import { STATUS_FIELD_NODE_ID, STATUS_OPTION_ID } from "./fixtures/project-status-data.mjs";

const CLI_NUMERIC_ID_USAGE = /numeric REST id/;
const CLI_NODE_ID_USAGE = /PVTI_/;
const CLI_FAILURE_PREFIX = /project-status failed/;
const HELP_SET_PATTERN = /to SET/;
const HELP_CHANGED_PATTERN = /changed: false/;
const HELP_LIST_OPTIONS_PATTERN = /--list-options/;
const SCRIPT_PATH = fileURLToPath(new URL("./project-status.mjs", import.meta.url));
const USAGE_EXIT_CODE = 2;

test("AC-07 CLI with no item IDs prints both ID forms and exits before any gh call", () => {
  // Built from scratch without PATH, so a gh call would fail with ENOENT and exit 1 instead of 2.
  // biome-ignore lint/style/noProcessEnv: only SystemRoot is copied; the host environment is never spread.
  const systemRoot = process.env.SystemRoot;
  const env = {};
  if (systemRoot !== undefined) {
    env.SystemRoot = systemRoot;
  }

  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "TychoHenzen", "2", STATUS_FIELD_NODE_ID, STATUS_OPTION_ID, "Done"],
    { encoding: "utf8", env, windowsHide: true },
  );

  assert.equal(result.status, USAGE_EXIT_CODE);
  assert.match(result.stderr, CLI_NUMERIC_ID_USAGE);
  assert.match(result.stderr, CLI_NODE_ID_USAGE);
  assert.doesNotMatch(result.stderr, CLI_FAILURE_PREFIX);
});

test("--help prints the usage and the argument meaning and exits 0", () => {
  // biome-ignore lint/style/noProcessEnv: only SystemRoot is copied; the host environment is never spread.
  const systemRoot = process.env.SystemRoot;
  const env = {};
  if (systemRoot !== undefined) {
    env.SystemRoot = systemRoot;
  }

  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--help"], { encoding: "utf8", env, windowsHide: true });

  assert.equal(result.status, 0);
  assert.match(result.stdout, HELP_SET_PATTERN);
  assert.match(result.stdout, HELP_CHANGED_PATTERN);
  assert.match(result.stdout, HELP_LIST_OPTIONS_PATTERN);
  assert.equal(result.stderr, "");
});
