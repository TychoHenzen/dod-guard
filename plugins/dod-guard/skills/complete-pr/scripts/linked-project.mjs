#!/usr/bin/env node
// Resolves a repository's GitHub Project from its explicit Project link, with
// one read-only GraphQL read and no fallback. Skills run this for step 3 of
// standards/github-request-discipline.md instead of writing the query or the
// exactly-one check by hand. Exit 0 is one open link, exit 1 is none or several
// (each a distinct outcome), and exit 2 is a usage error or a read that could
// not be trusted.
// biome-ignore lint/correctness/noNodejsModules: A shipped Node command.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: A shipped Node command.
import { pathToFileURL } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { resolveLinkedProject } from "../../../lib/linked-project.mjs";
import { REPOSITORY_NAME } from "../../../lib/repository-identity.mjs";
import { runGh } from "./lib/gh-runner.mjs";

const USAGE = `usage: linked-project.mjs --repository=<owner/name>

Reads the repository's explicitly linked GitHub Projects once and keeps the
open ones.
exit 0  {outcome: "resolved", repository,
         project: {ownerLogin, ownerType, basePath, number, title, id}}
exit 1  {outcome: "none" | "several", repository,
         projects: [{ownerLogin, number, title}]}
exit 2  usage error, gh failure, GraphQL errors, no such repository,
        a malformed node, or an incomplete page`;

const EXIT = { resolved: 0, unresolved: 1, failed: 2 };

// Enough of one open link for a stop that names owner, number, and title.
function listedProject({ ownerLogin, number, title }) {
  return { ownerLogin, number, title };
}

// The JSON a skill reads: the whole Project when exactly one resolves,
// otherwise the listed form of each open link.
function linkedProjectReport({ repository, outcome, projects }) {
  if (outcome === "resolved") {
    const report = { outcome, repository, project: projects[0] };
    return { code: EXIT.resolved, report };
  }
  const report = { outcome, repository, projects: projects.map(listedProject) };
  return { code: EXIT.unresolved, report };
}

// ASSUMPTION: any flag besides --repository is a usage error, because a skill
// that passes another flag (say, a fallback) expects behavior this command
// deliberately does not have.
function repositoryArg(argv) {
  const args = parseArgs(argv);
  if (args === null || Object.keys(args).length !== 1) {
    return null;
  }
  const { repository } = args;
  if (typeof repository !== "string" || !REPOSITORY_NAME.test(repository)) {
    return null;
  }
  return repository;
}

function runCli(argv, io = {}) {
  const { runner = runGh, stdout = process.stdout } = io;
  const { stderr = process.stderr } = io;
  const repository = repositoryArg(argv);
  if (repository === null) {
    stderr.write(`${USAGE}\n`);
    return EXIT.failed;
  }
  // Unlike closure.mjs, every thrown failure is exit 2, so exit 1 always means
  // the read was complete and found zero or several open links.
  try {
    const resolved = resolveLinkedProject(repository, runner);
    const { code, report } = linkedProjectReport(resolved);
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return code;
  } catch (error) {
    stderr.write(`linked-project failed: ${error.message}\n`);
    return EXIT.failed;
  }
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (import.meta.url === invoked) {
  process.exitCode = runCli(process.argv.slice(2));
}

export { runCli };
