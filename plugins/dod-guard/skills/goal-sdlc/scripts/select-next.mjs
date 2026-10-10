// Picks the next queue item from a Project snapshot the caller already read.
// The caller fetches with its own GitHub connector (see
// standards/github-request-discipline.md) and saves the result as JSON; this
// script classifies it through the shared queue classifier, so it makes no
// provider calls and no mutations.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { localDate } from "../../../lib/friction-log.mjs";
import { classifyQueue } from "../../../lib/queue-classifier.mjs";

const USAGE = `usage: select-next.mjs --snapshot=<file.json>

The snapshot is one JSON object:
  repository      "owner/name" of the target repository
  defaultBranch   the repository's default branch
  today           optional local date (YYYY-MM-DD) for friction-log holds
  items           every Project item from every page, each with fields
                  Status, Repository, Parent issue, and Linked pull requests
  issues          every listed issue, with number, state, title, parent,
                  children (an empty array when it has none), and
                  activeCheckpoint (true while its delivery checkpoint is
                  open, false once it is finished)
  pullRequests    every linked pull request, with number, state, mergedAt,
                  head {repository, ref, sha}, base {ref, sha}, mergeCommit,
                  requiredChecks, and trustedHeadSha (the head SHA its
                  /complete-pr run verified)

A merged delivery counts as complete only with activeCheckpoint false on
every issue and trustedHeadSha equal to head.sha; otherwise it is held.

Every item, issue, pull request, and parent, child, or linked pull request
reference names its repository as owner/name.
Records from another repository are ignored.
A relation that leaves the repository holds its issue, with a reason naming
owner/name#N.
A record with no repository, a record with no number, a duplicated record, an
item whose issue is missing, or a linked pull request that is missing selects
nothing and is named in missingEvidence.
today defaults to the local date.`;

const EMPTY_SNAPSHOT = { items: [], issues: [], pullRequests: [] };

function groupSummary({ rootIssueNumber, decision }) {
  return { rootIssueNumber, kind: decision.kind, reasons: decision.reasons };
}

function selectNext(input, today) {
  const snapshot = { ...EMPTY_SNAPSHOT, ...input };
  const { groups, selected, counts, missingEvidence } = classifyQueue(snapshot, { today });
  return {
    selected: selected && {
      rootIssueNumber: selected.rootIssueNumber,
      status: selected.decision.status,
      issueNumbers: selected.records.map(({ issueNumber }) => issueNumber),
    },
    groups: groups.map(groupSummary),
    counts,
    missingEvidence,
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
  // The only clock read. The classifier takes the date as data, so it stays a pure function.
  const today = snapshot?.today ?? localDate(new Date());
  const result = selectNext(snapshot, today);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (import.meta.url === invoked) await main();
