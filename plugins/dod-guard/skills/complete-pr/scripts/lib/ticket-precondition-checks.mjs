// The ordered checks behind ticket-preconditions.mjs. Each check returns a stop
// report or null, and the first stop ends the run. A read that cannot be trusted
// throws, which the command reports as exit 2 and never as a stop.
import { resolveLinkedProject } from "../../../../lib/linked-project.mjs";
import { isNotFoundResult, readIssueStatusInProject } from "./project-reads.mjs";

const EXIT = { ready: 0, stop: 1, failed: 2 };

function stopped(check, detail) {
  return { code: EXIT.stop, report: { outcome: "stop", check, detail } };
}

function projectLabel({ ownerLogin, number }) {
  return `${ownerLogin}#${number}`;
}

function linkedProjectStop(linked) {
  if (linked.outcome === "none") {
    return stopped("linked-project-none", "the repository has no open linked Project");
  }
  if (linked.outcome === "several") {
    const names = linked.projects.map(projectLabel).join(", ");
    return stopped("linked-project-several", `the repository has several open linked Projects: ${names}`);
  }
  return null;
}

// The issue's own REST record decides whether it is an issue of this repository. A pull request
// shares the issue number space, so it is a stop, not a ready issue.
function issueStop({ repository, issue }, runner) {
  const result = runner(["api", `repos/${repository}/issues/${issue}`], [0, 1]);
  if (isNotFoundResult(result)) {
    return stopped("issue-not-in-repository", `issue not found in ${repository}`);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "gh failed");
  }
  if (JSON.parse(result.stdout).pull_request !== undefined) {
    return stopped("issue-not-in-repository", "number is a pull request");
  }
  return null;
}

// An empty status is the reader's answer for an item whose Status field holds no value.
function statusStop(status, project, expected) {
  if (status === null) {
    return stopped("issue-not-in-project", `issue is not an item of Project ${projectLabel(project)}`);
  }
  if (status === "") {
    return stopped("status-blank", `the issue's item in Project ${projectLabel(project)} has no Status`);
  }
  if (status !== expected) {
    return stopped("status-mismatch", `status is ${status}, expected ${expected}`);
  }
  return null;
}

function readyResult({ repository, issue }, project, status) {
  const { ownerLogin, number, title } = project;
  const report = { outcome: "ready", repository, issue: Number(issue), project: { ownerLogin, number, title }, status };
  return { code: EXIT.ready, report };
}

function projectResult(project, options, runner) {
  const issue = { repository: options.repository, number: Number(options.issue) };
  const status = readIssueStatusInProject(project, issue, runner);
  return statusStop(status, project, options.expected) ?? readyResult(options, project, status);
}

// The ready result, or the first stop. The Project is the one the link names, so its owner may
// differ from the repository's owner.
function evaluate(options, runner) {
  const linked = resolveLinkedProject(options.repository, runner);
  const early = linkedProjectStop(linked) ?? issueStop(options, runner);
  return early ?? projectResult(linked.projects[0], options, runner);
}

export { EXIT, evaluate };
