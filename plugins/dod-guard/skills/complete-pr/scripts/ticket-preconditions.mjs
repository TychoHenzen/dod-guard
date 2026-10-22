#!/usr/bin/env node
// Checks that one issue is ready to work before a skill acts on it: the repository
// has exactly one open linked Project, the issue is an issue of that repository and
// an item of that Project, and the item's Status is the one the caller expects. The
// checks run in that order and the first failure stops. Exit 0 is ready, exit 1 is
// a stop naming its check, and exit 2 is a usage error or a read that could not be
// trusted. Project membership and Status come from one GraphQL query on the issue
// (its projectItems), not the REST items list, whose pages are unstable. A failed or
// incomplete read is exit 2 and never issue-not-in-project.
// biome-ignore lint/correctness/noNodejsModules: A shipped Node command.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: A shipped Node command.
import { pathToFileURL } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { resolveLinkedProject } from "../../../lib/linked-project.mjs";
import { REPOSITORY_NAME } from "../../../lib/repository-identity.mjs";
import { runGh } from "./lib/gh-runner.mjs";
import { isNotFoundResult, readIssueStatusInProject } from "./lib/project-reads.mjs";

const USAGE = `usage: ticket-preconditions.mjs --repository=<owner/name> --issue=<n> --expect-status=<name>

Checks one issue against the repository's single open linked Project.
exit 0  {outcome: "ready", repository, issue, project: {ownerLogin, number, title}, status}
exit 1  {outcome: "stop", check, detail}
        check: linked-project-none | linked-project-several | issue-not-in-repository
               | issue-not-in-project | status-mismatch
exit 2  usage error, a read that could not be trusted, or a gh failure`;

const EXIT = { ready: 0, stop: 1, failed: 2 };
const OPTION_NAMES = ["expect-status", "issue", "repository"];
const ISSUE_NUMBER = /^[1-9][0-9]*$/u;

function stopped(check, detail) {
  return { outcome: "stop", check, detail };
}

function projectLabel({ ownerLogin, number }) {
  return `${ownerLogin}#${number}`;
}

// Null when the argv holds exactly the three options with usable values.
function optionsOf(argv) {
  const args = parseArgs(argv);
  if (args === null) {
    return null;
  }
  const exact = Object.keys(args).length === OPTION_NAMES.length && OPTION_NAMES.every((name) => name in args);
  if (!exact) {
    return null;
  }
  const { repository, issue } = args;
  const expected = args["expect-status"];
  if (typeof repository !== "string" || !REPOSITORY_NAME.test(repository)) {
    return null;
  }
  if (typeof issue !== "string" || !ISSUE_NUMBER.test(issue)) {
    return null;
  }
  if (typeof expected !== "string" || expected === "" || expected === "true") {
    return null;
  }
  return { repository, issue, expected };
}

// The issue's own REST record decides whether it is an issue of this repository. A pull request
// shares the issue number space, so it is a stop, not a ready issue.
function issueStopOf(repository, issue, runner) {
  const result = runner(["api", `repos/${repository}/issues/${issue}`], [0, 1]);
  if (isNotFoundResult(result)) {
    return stopped("issue-not-in-repository", `issue not found in ${repository}`);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "gh failed");
  }
  const data = JSON.parse(result.stdout);
  if (data.pull_request !== undefined) {
    return stopped("issue-not-in-repository", "number is a pull request");
  }
  return null;
}

// The ready report, or the first stop. The Project is the one the link names, so its owner may
// differ from the repository's owner.
function evaluate(options, runner) {
  const { repository, issue, expected } = options;
  const linked = resolveLinkedProject(repository, runner);
  if (linked.outcome === "none") {
    return { code: EXIT.stop, report: stopped("linked-project-none", "the repository has no open linked Project") };
  }
  if (linked.outcome === "several") {
    const names = linked.projects.map(projectLabel).join(", ");
    const detail = `the repository has several open linked Projects: ${names}`;
    return { code: EXIT.stop, report: stopped("linked-project-several", detail) };
  }
  const [project] = linked.projects;
  const issueStop = issueStopOf(repository, issue, runner);
  if (issueStop !== null) {
    return { code: EXIT.stop, report: issueStop };
  }
  const status = readIssueStatusInProject(project, repository, Number(issue), runner);
  if (status === null) {
    const detail = `issue is not an item of Project ${projectLabel(project)}`;
    return { code: EXIT.stop, report: stopped("issue-not-in-project", detail) };
  }
  if (status !== expected) {
    const detail = `status is ${status}, expected ${expected}`;
    return { code: EXIT.stop, report: stopped("status-mismatch", detail) };
  }
  const { ownerLogin, number, title } = project;
  const report = {
    outcome: "ready",
    repository,
    issue: Number(issue),
    project: { ownerLogin, number, title },
    status,
  };
  return { code: EXIT.ready, report };
}

function runCli(argv, io = {}) {
  const { runner = runGh, stdout = process.stdout, stderr = process.stderr } = io;
  const options = optionsOf(argv);
  if (options === null) {
    stderr.write(`${USAGE}\n`);
    return EXIT.failed;
  }
  try {
    const { code, report } = evaluate(options, runner);
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return code;
  } catch (error) {
    stderr.write(`ticket-preconditions failed: ${error.message}\n`);
    return EXIT.failed;
  }
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (import.meta.url === invoked) {
  process.exitCode = runCli(process.argv.slice(2));
}

export { runCli };
