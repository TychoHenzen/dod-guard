// The applied-GitHub fake: answers the closure writes and the Project reads
// that project-status.mjs makes, from the fixture the builder read.
import { fieldPages, ok, OWNER } from "../lib/fixtures/rest-shapes.mjs";
import { methodOf } from "./closure-cli.mjs";

const STATUS_OPTIONS = fieldPages()[0][0].options;
const ENDPOINT_PATH = /^(repos|users)\//;
const ISSUE_PATH = /\/issues\/(\d+)/;
const PROJECT = `users/${OWNER}/projectsV2/2`;

function argValue(args, prefix) {
  return args
    .find((value) => String(value).startsWith(prefix))
    ?.slice(prefix.length);
}

// Answers the closure writes and the Project reads that project-status.mjs
// makes, from the fixture the builder read. A Project item PATCH changes that
// item's Status, so a later readback sees the change.
function appliedGitHub({ pages, issues, pulls }) {
  const state = {
    items: pages.flat(),
    issues: new Map(
      issues.map((issue) => [issue.number, structuredClone(issue)]),
    ),
    pulls: new Map(pulls.map((record) => [record.number, record])),
    nextComment: 9000,
  };
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    const endpoint = String(
      args.find((value) => ENDPOINT_PATH.test(String(value))),
    );
    if (endpoint.startsWith("users/")) {
      return projectReply(state, args, endpoint);
    }
    if (endpoint.includes("/pulls/")) {
      return ok(state.pulls.get(Number(endpoint.split("/").pop())));
    }
    return issueReply(state, args, endpoint);
  };
  return { runner, calls, items: state.items, issues: state.issues };
}

function writeStatus(state, args, endpoint) {
  const item = state.items.find(
    ({ id }) => String(id) === endpoint.slice(`${PROJECT}/items/`.length),
  );
  const option = STATUS_OPTIONS.find(
    ({ id }) => id === argValue(args, "fields[][value]="),
  );
  if (item === undefined || option === undefined) {
    return {
      status: 1,
      stdout: "",
      stderr: `no Project item or option in ${endpoint}`,
    };
  }
  item.fields.find(({ id }) => id === 101).value = {
    id: option.id,
    name: option.name,
  };
  return ok({});
}

// The Project reads, and the Status write, that project-status.mjs makes.
function projectReply(state, args, endpoint) {
  if (endpoint === PROJECT) {
    return ok({ node_id: "PVT_round" });
  }
  if (endpoint.startsWith(`${PROJECT}/fields`)) {
    return ok(fieldPages());
  }
  if (endpoint.startsWith(`${PROJECT}/items?`)) {
    return ok([state.items]);
  }
  return writeStatus(state, args, endpoint);
}

function issueOf(state, endpoint) {
  return state.issues.get(Number(ISSUE_PATH.exec(endpoint)?.[1]));
}

// The closure reads and writes on one issue: its record, its comments, and its
// close.
function issueReply(state, args, endpoint) {
  const method = methodOf(args);
  const issue = issueOf(state, endpoint);
  if (!issue) {
    return { status: 1, stdout: "", stderr: `no issue in ${endpoint}` };
  }
  if (method === "POST") {
    issue.comments.push({
      id: state.nextComment,
      body: argValue(args, "body="),
    });
    state.nextComment += 1;
    return ok({});
  }
  if (endpoint.includes("/comments")) {
    return ok([issue.comments]);
  }
  if (method === "PATCH") {
    issue.state = argValue(args, "state=");
    issue.state_reason = argValue(args, "state_reason=");
    return ok({});
  }
  return ok({
    number: issue.number,
    state: issue.state,
    state_reason: issue.state_reason,
  });
}

export { appliedGitHub };
