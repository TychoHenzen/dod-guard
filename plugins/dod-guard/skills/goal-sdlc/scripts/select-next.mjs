// Picks the next queue item from a Project snapshot the caller already read.
// The caller fetches with its own GitHub connector (see
// standards/github-request-discipline.md) and saves the result as JSON; this
// script only classifies it, so it makes no provider calls and no mutations.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { classifyQueueGroups, readQueueSnapshot, selectQueueItem } from "./lib/queue-readback.mjs";

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

function snapshotProvider(snapshot) {
  const issues = new Map((snapshot.issues ?? []).map((issue) => [Number(issue.number), issue]));
  const pullRequests = new Map((snapshot.pullRequests ?? []).map((pull) => [Number(pull.number), pull]));
  return {
    listProjectItems: async () => ({ items: snapshot.items ?? [], pageInfo: { hasNextPage: false } }),
    readIssue: async ({ issueNumber }) => issues.get(Number(issueNumber)) ?? null,
    readPullRequest: async ({ pullNumber }) => pullRequests.get(Number(pullNumber)) ?? null,
  };
}

export async function selectNext(snapshot) {
  const read = await readQueueSnapshot({
    provider: snapshotProvider(snapshot),
    project: snapshot.project ?? {},
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
    groups: classifyQueueGroups(context).map(({ rootIssueNumber, decision }) => ({
      rootIssueNumber,
      kind: decision.kind,
      reasons: decision.reasons,
    })),
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
  process.stdout.write(`${JSON.stringify(await selectNext(snapshot), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
