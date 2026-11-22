// biome-ignore lint/correctness/noNodejsModules: A Node test file.
import assert from "node:assert/strict";
// Shared fixtures for the ticket-preconditions tests. They are split by concern across two test files.

import { runCli } from "../ticket-preconditions.mjs";
import {
  ENDPOINT,
  fakeRest,
  issueProjectItemNode,
  issueProjectItemsReply,
  linkedProjectNode,
  linkedProjectsReply,
} from "./closure-snapshot.test-support.mjs";
import { OWNER, ok, REPO } from "./fixtures/rest-shapes.mjs";

const ISSUE_NUMBER = 24;
const PROJECT_NUMBER = 2;
const SECOND_PROJECT = 3;
const ISSUE = `repos/${REPO}/issues/${ISSUE_NUMBER}`;
const USAGE_START = "usage: ticket-preconditions.mjs";
const FAILED_START = "ticket-preconditions failed:";
const EXPECTED_READY = {
  outcome: "ready",
  repository: REPO,
  issue: ISSUE_NUMBER,
  project: { ownerLogin: OWNER, number: PROJECT_NUMBER, title: `Project ${PROJECT_NUMBER}` },
  status: "Todo",
};

// A REST issue record that names a pull request. The key is set by assignment for the naming rule.
function pullRequestReply() {
  const reply = { number: ISSUE_NUMBER };
  reply.pull_request = {};
  return ok(reply);
}

// The route table for a ready issue. fakeRest reads it on every call, so a test may change an entry
// between runs.
function routes(status = "Todo", overrides = {}) {
  return {
    [ENDPOINT.linkedProjects]: linkedProjectsReply([linkedProjectNode(PROJECT_NUMBER)]),
    [ISSUE]: ok({ number: ISSUE_NUMBER, state: "open" }),
    [ENDPOINT.issueProjectItems]: issueProjectItemsReply([issueProjectItemNode(PROJECT_NUMBER, status)]),
    ...overrides,
  };
}

function argv(status = "Todo") {
  return [`--repository=${REPO}`, `--issue=${ISSUE_NUMBER}`, `--expect-status=${status}`];
}

function sink(text, key) {
  return {
    write: (chunk) => {
      text[key] += chunk;
    },
  };
}

function run(args, table) {
  const { calls, runner } = fakeRest(table);
  const text = { out: "", err: "" };
  const code = runCli(args, { runner, stdout: sink(text, "out"), stderr: sink(text, "err") });
  return { code, calls, out: text.out, err: text.err };
}

// Runs with the given routes replaced and asserts a stop report (exit 1) that names the check.
function assertStop(overrides, check) {
  const result = run(argv(), routes("Todo", overrides));
  assert.equal(result.code, 1, result.err);
  assert.equal(stopReport(result).check, check);
}

// The parsed stop JSON that a stop run writes to stdout.
function stopReport(result) {
  return JSON.parse(result.out);
}

export {
  argv,
  assertStop,
  EXPECTED_READY,
  FAILED_START,
  ISSUE,
  ISSUE_NUMBER,
  PROJECT_NUMBER,
  pullRequestReply,
  routes,
  run,
  SECOND_PROJECT,
  stopReport,
  USAGE_START,
};
