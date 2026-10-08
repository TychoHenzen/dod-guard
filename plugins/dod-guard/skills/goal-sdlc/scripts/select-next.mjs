// Picks the next queue item from a Project snapshot the caller already read.
// The caller fetches with its own GitHub connector (see
// standards/github-request-discipline.md) and saves the result as JSON; this
// script only classifies it, so it makes no provider calls and no mutations.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import {
  classifyQueueGroups,
  readQueueSnapshot,
  selectQueueItem,
} from "./lib/queue-readback.mjs";

const USAGE = `usage: select-next.mjs --snapshot=<file.json>

The snapshot is one JSON object:
  repository      "owner/name" of the target repository
  defaultBranch   the repository's default branch
  today           optional local date (YYYY-MM-DD) for friction-log holds
  items           every Project item from every page, each with fields
                  Status, Repository, Parent issue, and Linked pull requests
  issues          every listed issue, with number, state, title, parent, and
                  children (an empty array when it has none)
  pullRequests    every linked pull request, with number, state, mergedAt,
                  head {repository, ref, sha}, base {ref, sha}, mergeCommit,
                  and requiredChecks`;

const EMPTY_SNAPSHOT = { project: {}, items: [], issues: [], pullRequests: [] };

function byNumber(records) {
  return new Map(records.map((record) => [Number(record.number), record]));
}

function snapshotProvider({ items, issues, pullRequests }) {
  const issuesByNumber = byNumber(issues);
  const pullsByNumber = byNumber(pullRequests);
  const page = { items, pageInfo: { hasNextPage: false } };
  return {
    listProjectItems: async () => page,
    readIssue: async ({ issueNumber }) =>
      issuesByNumber.get(Number(issueNumber)) ?? null,
    readPullRequest: async ({ pullNumber }) =>
      pullsByNumber.get(Number(pullNumber)) ?? null,
  };
}

function groupSummary({ rootIssueNumber, decision }) {
  return { rootIssueNumber, kind: decision.kind, reasons: decision.reasons };
}

async function selectNext(input) {
  const snapshot = { ...EMPTY_SNAPSHOT, ...input };
  const read = await readQueueSnapshot({
    provider: snapshotProvider(snapshot),
    project: snapshot.project,
    repository: snapshot.repository,
    defaultBranch: snapshot.defaultBranch,
  });
  const context = { ...read, today: snapshot.today };
  const selected = selectQueueItem(context);
  return {
    selected: selected && {
      rootIssueNumber: selected.rootIssueNumber,
      status: selected.decision.status,
      issueNumbers: selected.records.map(({ issueNumber }) => issueNumber),
    },
    groups: classifyQueueGroups(context).map(groupSummary),
    counts: read.counts,
    missingEvidence: read.missingEvidence,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args?.snapshot || args.snapshot === "true") {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  const snapshot = JSON.parse(await readFile(args.snapshot, "utf8"));
  const result = await selectNext(snapshot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (import.meta.url === invoked) await main();
