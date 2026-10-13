// biome-ignore lint/correctness/noNodejsModules: This read-only proof compares snapshots.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This read-only proof resolves its direct entrypoint.
import { resolve } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This read-only proof resolves its direct entrypoint.
import { fileURLToPath } from "node:url";
// biome-ignore lint/correctness/noNodejsModules: This read-only proof exposes a direct CLI.
import process from "node:process";
import { runGh } from "./lib/gh-runner.mjs";
import { statusValueName } from "./lib/project-reads.mjs";

const LINE_BREAK = /\r?\n/;

function readJson(commandRunner, args) {
  const result = commandRunner(args);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `gh ${args.join(" ")} failed.`);
  }
  return JSON.parse(result.stdout);
}

function readJsonLines(commandRunner, args) {
  const result = commandRunner(args);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `gh ${args.join(" ")} failed.`);
  }
  const output = result.stdout.trim();
  if (output === "") {
    return [];
  }
  return output.split(LINE_BREAK).map((line) => JSON.parse(line));
}

// An item without a Status value reads as null; a value the shared flattener cannot verify stops the
// proof, because two snapshots that agree on an unreadable value prove nothing.
function statusName(item) {
  return statusValueName(item.fields?.find(({ name }) => name === "Status")?.value);
}

function projectItemRecord(item) {
  return {
    id: item.id,
    nodeId: item.node_id,
    issueNumber: item.content?.number ?? null,
    repository: item.content?.repository?.full_name ?? null,
    status: statusName(item),
  };
}

function readSnapshot({ repository, issueNumber, owner, projectNumber, statusFieldId, commandRunner }) {
  const issue = readJson(commandRunner, ["api", `repos/${repository}/issues/${issueNumber}`]);
  const items = readJsonLines(commandRunner, [
    "api",
    "--paginate",
    "--jq",
    ".[] | {id,node_id,content:{number:.content.number,repository:{full_name:.content.repository.full_name}},fields:.fields}",
    `users/${owner}/projectsV2/${projectNumber}/items?per_page=100&fields=${statusFieldId}`,
  ]);
  const records = items.map(projectItemRecord);
  const matchingItems = records.filter((item) => item.repository === repository && item.issueNumber === issueNumber);
  if (matchingItems.length !== 1) {
    throw new Error(`Expected one Project item for ${repository}#${issueNumber}; found ${matchingItems.length}.`);
  }
  return {
    issue: { id: issue.id, number: issue.number, state: issue.state },
    projectItem: matchingItems[0],
    unrelatedItems: records
      .filter((item) => item.id !== matchingItems[0].id)
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
  };
}

export function verifyLiveLifecycleReadback({
  repository,
  issueNumber,
  owner,
  projectNumber,
  expectedIssueState,
  expectedStatus,
  commandRunner = runGh,
}) {
  const fields = readJson(commandRunner, [
    "api",
    "--paginate",
    "--slurp",
    `users/${owner}/projectsV2/${projectNumber}/fields?per_page=100`,
  ]).flat();
  const statusFields = fields.filter(({ id, name }) => name === "Status" && Number.isInteger(Number.parseInt(String(id), 10)));
  if (statusFields.length !== 1) throw new Error(`Expected one numeric Status field; found ${statusFields.length}.`);
  const request = {
    repository,
    issueNumber: Number(issueNumber),
    owner,
    projectNumber: Number(projectNumber),
    statusFieldId: statusFields[0].id,
    commandRunner,
  };
  const before = readSnapshot(request);
  const after = readSnapshot(request);
  assert.deepEqual(after.issue, before.issue, "Issue identity or state changed during read-only verification.");
  assert.deepEqual(after.projectItem, before.projectItem, "Project item identity or status changed during read-only verification.");
  assert.deepEqual(after.unrelatedItems, before.unrelatedItems, "An unrelated Project item changed during read-only verification.");
  if (expectedIssueState) assert.equal(after.issue.state, expectedIssueState);
  if (expectedStatus) assert.equal(after.projectItem.status, expectedStatus);
  return { issue: after.issue, projectItem: after.projectItem, unrelatedItemsUnchanged: true, requests: 5 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [repository, issueNumber, owner, projectNumber, expectedIssueState, expectedStatus] = process.argv.slice(2);
  if ((((repository && issueNumber ) && owner ) && projectNumber)) {
    try {
      process.stdout.write(`${JSON.stringify(verifyLiveLifecycleReadback({
        repository,
        issueNumber,
        owner,
        projectNumber,
        expectedIssueState,
        expectedStatus,
      }), null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`lifecycle live readback failed: ${error.message}\n`);
      process.exitCode = 1;
    }
  } else {
    process.stderr.write("Usage: node lifecycle-live-readback.mjs <owner/repo> <issue-number> <project-owner> <project-number> [issue-state] [project-status]\n");
    process.exitCode = 2;
  }
}
