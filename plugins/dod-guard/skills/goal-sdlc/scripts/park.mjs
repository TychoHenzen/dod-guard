// Parks or unparks one queue root by writing or deleting its parked record, an issue comment the shared
// queue classifier reads. This is the only GitHub write goal-sdlc makes. It writes the one comment and reads
// the comment list back, so a run that did not land exits non-zero instead of reporting success.
import { pathToFileURL } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { parkedRecords, renderParkedRecord } from "../../../lib/parked-record.mjs";
import { ghJsonArrayPages, runGh } from "../../complete-pr/scripts/lib/gh-runner.mjs";

const USAGE = `usage: park.mjs --action=park --repository=<owner/name> --issue=<number>
                --blocked=<one line> --unblocks-when=<one line>
       park.mjs --action=unpark --repository=<owner/name> --issue=<number>

park posts one "## Parked" comment on the issue, so the queue holds that root
until the comment is deleted. unpark deletes every parked comment on the issue.
A rerun writes nothing when the issue is already in the requested state.
Both read the comment list back and print it as JSON. Exit 0 means the readback
shows the requested state, 1 means it does not or GitHub refused, 2 means the
arguments are missing or invalid.`;

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/u;
const ISSUE_NUMBER = /^[1-9]\d*$/u;

function usageProblem(args) {
  if (!args) return "arguments must be flags only";
  if (!["park", "unpark"].includes(args.action)) return "--action must be park or unpark";
  if (!REPOSITORY.test(args.repository ?? "")) return "--repository must be owner/name";
  if (!ISSUE_NUMBER.test(args.issue ?? "")) return "--issue must be a positive issue number";
  if (args.action === "park") {
    for (const name of ["blocked", "unblocks-when"]) {
      const value = args[name] ?? "";
      if (value.trim() === "" || value === "true" || /[\r\n]/u.test(value))
        return `--${name} must be one nonblank line`;
    }
  }
  return null;
}

function readRecords({ repository, issue }, run) {
  const comments = ghJsonArrayPages(`repos/${repository}/issues/${issue}/comments?per_page=100`, run);
  return parkedRecords(comments);
}

// A rerun is a no-op: when the issue is already in the requested state nothing is written. The problem is
// null when the readback shows the requested state, else the reason it does not.
function applyAction({ action, repository, issue, blocked, unblocksWhen }, run) {
  const target = { repository, issue };
  const before = readRecords(target, run);
  if (action === "park") {
    if (before.length > 0) return { records: before, problem: null };
    const body = renderParkedRecord({ blocked, unblocksWhen });
    run(["api", "--method", "POST", `repos/${repository}/issues/${issue}/comments`, "-f", `body=${body}`], [0]);
  } else {
    if (before.length === 0) return { records: before, problem: null };
    for (const { commentId } of before) {
      run(["api", "--method", "DELETE", `repos/${repository}/issues/comments/${commentId}`], [0]);
    }
  }
  const records = readRecords(target, run);
  const landed = action === "park" ? records.length === 1 : records.length === 0;
  const wanted = action === "park" ? "parked" : "unparked";
  return { records, problem: landed ? null : `readback does not show issue #${issue} ${wanted}` };
}

function parkIssue(options, run = runGh) {
  const { records, problem } = applyAction(options, run);
  return { ok: problem === null, problem, parked: records };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const problem = usageProblem(args);
  if (problem) {
    process.stderr.write(`${problem}\n${USAGE}\n`);
    process.exitCode = 2;
    return;
  }
  const options = {
    action: args.action,
    repository: args.repository,
    issue: Number(args.issue),
    blocked: args.blocked,
    unblocksWhen: args["unblocks-when"],
  };
  try {
    const result = parkIssue(options);
    process.stdout.write(`${JSON.stringify({ ...options, ...result }, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (import.meta.url === invoked) main();

export { parkIssue, usageProblem };
