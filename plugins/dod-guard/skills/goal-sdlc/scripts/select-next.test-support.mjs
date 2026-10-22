import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { REFINED_BODY } from "../../../lib/refined-body.test-support.mjs";
import { withSnapshotFile } from "./snapshot-file.test-support.mjs";

export const REPOSITORY = "TychoHenzen/dod-guard";
export const FOREIGN_REPOSITORY = "other/repo";
export const PARENT_517 = { repository: REPOSITORY, number: 517 };
export const SCRIPT = fileURLToPath(new URL("./select-next.mjs", import.meta.url));

export function item(number, status, { parentIssue = null, linked = [] } = {}) {
  return {
    id: String(number),
    content: { number, repository: REPOSITORY },
    fields: [
      { name: "Status", value: { name: status } },
      { name: "Repository", value: REPOSITORY },
      { name: "Parent issue", value: parentIssue },
      { name: "Linked pull requests", value: linked },
    ],
  };
}

export function issue(number, overrides = {}) {
  return {
    number,
    repository: REPOSITORY,
    state: "open",
    title: `Issue ${number}`,
    parent: null,
    children: [],
    blockedBy: [],
    body: REFINED_BODY,
    ...overrides,
  };
}

export function snapshot() {
  return {
    repository: REPOSITORY,
    defaultBranch: "master",
    today: "2026-10-08",
    items: [item(31, "Backlog"), item(517, "Todo"), item(518, "Todo", { parentIssue: PARENT_517 })],
    issues: [
      issue(31),
      issue(517, { children: [{ repository: REPOSITORY, number: 518 }] }),
      issue(518, { parent: { repository: REPOSITORY, number: 517 } }),
    ],
    pullRequests: [],
  };
}

// Runs the command on one snapshot and returns its raw stdout, so a test can compare bytes.
export function stdoutOf(input) {
  return withSnapshotFile("select-next-", input, (file) => {
    const run = spawnSync(process.execPath, [SCRIPT, `--snapshot=${file}`], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout;
  });
}

export async function selectNext(input) {
  return JSON.parse(await stdoutOf(input));
}

// An item of another repository. Its number may match a target record's, and its fields name the
// other repository, so it must never be read as a target item.
export function foreignItem(number, status, parentIssue = null) {
  return {
    id: `foreign-${number}`,
    content: { number, repository: FOREIGN_REPOSITORY },
    fields: [
      { name: "Status", value: { name: status } },
      { name: "Repository", value: FOREIGN_REPOSITORY },
      { name: "Parent issue", value: parentIssue },
      { name: "Linked pull requests", value: [] },
    ],
  };
}
