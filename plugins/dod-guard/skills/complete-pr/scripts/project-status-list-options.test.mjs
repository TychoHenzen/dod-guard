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
import { listStatusOptions } from "./project-status.mjs";
import {
  createRunner,
  listReads,
  projectFields,
  STATUS_FIELD_ID,
  STATUS_FIELD_NODE_ID,
  STATUS_OPTION_ID,
} from "./project-status-fixtures.mjs";

const STATUS_FIELD_ERROR = /exactly one REST field/;
const CLI_FAILURE_PREFIX = /project-status failed/;
const SCRIPT_PATH = fileURLToPath(new URL("./project-status.mjs", import.meta.url));
const USAGE_EXIT_CODE = 2;
const SINGLE_SELECT_PATTERN = /single-select/;
const NO_READABLE_NAME_PATTERN = /no readable name/;
const LIST_OPTIONS_FLAG_PATTERN = /--list-options/;

test("listStatusOptions names every Status option, including a {raw, html} name, and writes nothing", () => {
  const fields = projectFields();
  fields[0].options[1] = { id: "f75ad846", name: { raw: "Todo", html: "Todo" } };
  const { calls, runner } = createRunner({ fields });

  const options = listStatusOptions({
    owner: "TychoHenzen",
    projectNumber: 2,
    statusFieldId: STATUS_FIELD_NODE_ID,
    commandRunner: runner,
  });

  assert.deepEqual(options, [
    { id: "30a230f4", name: "Backlog" },
    { id: "f75ad846", name: "Todo" },
    { id: "47fc9ee4", name: "In Progress" },
    { id: STATUS_OPTION_ID, name: "Done" },
  ]);
  assert.equal(
    calls.some((args) => args.includes("PATCH")),
    false,
  );
  assert.equal(listReads(calls).length, 0);
});

test("listStatusOptions stops on a missing, non-single-select, or unnamed Status field", () => {
  const options = { owner: "TychoHenzen", projectNumber: 2, statusFieldId: String(STATUS_FIELD_ID) };
  const missing = createRunner({ fields: [] });
  assert.throws(() => listStatusOptions({ ...options, commandRunner: missing.runner }), STATUS_FIELD_ERROR);

  const text = projectFields();
  text[0].data_type = "text";
  assert.throws(
    () => listStatusOptions({ ...options, commandRunner: createRunner({ fields: text }).runner }),
    SINGLE_SELECT_PATTERN,
  );

  const unnamed = projectFields();
  unnamed[0].options[0] = { id: "30a230f4", name: {} };
  assert.throws(
    () => listStatusOptions({ ...options, commandRunner: createRunner({ fields: unnamed }).runner }),
    NO_READABLE_NAME_PATTERN,
  );
});

test("--list-options with an argument missing exits 2 with usage and makes no gh call", () => {
  // Built from scratch without PATH, so a gh call would fail with ENOENT and exit 1 instead of 2.
  // biome-ignore lint/style/noProcessEnv: only SystemRoot is copied; the host environment is never spread.
  const systemRoot = process.env.SystemRoot;
  const env = {};
  if (systemRoot !== undefined) {
    env.SystemRoot = systemRoot;
  }

  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--list-options", "TychoHenzen", "2"], {
    encoding: "utf8",
    env,
    windowsHide: true,
  });

  assert.equal(result.status, USAGE_EXIT_CODE);
  assert.match(result.stderr, LIST_OPTIONS_FLAG_PATTERN);
  assert.doesNotMatch(result.stderr, CLI_FAILURE_PREFIX);
});
