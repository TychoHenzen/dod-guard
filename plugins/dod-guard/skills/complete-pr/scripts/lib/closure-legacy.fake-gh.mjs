// A fake gh runner for the record-legacy tests: it answers every gh call from a state object and records
// the comment writes in it.
// biome-ignore-all lint/style/useNamingConvention: the fixture mirrors GitHub REST field names, which are snake_case
const SHA_LENGTH = 40;
const REPO = "o/r";
const ISSUE = 61;
const PULL = 62;
const HEAD = "a".repeat(SHA_LENGTH);
const MERGE = "b".repeat(SHA_LENGTH);
const REPOS_PATH = /^repos\//;
const ISSUE_COMMENTS = /\/issues\/61\/comments/;
const CHECK_RUNS = /^repos\/o\/r\/commits\/([0-9a-f]{40})\/check-runs/;
const COMMIT_STATUS = /^repos\/o\/r\/commits\/([0-9a-f]{40})\/status/;
const BODY_PREFIX = "body=";
const NOT_FOUND = { status: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" };

function reply(value) {
  return { status: 0, stdout: JSON.stringify(value), stderr: "" };
}

function methodOf(args) {
  if (args.includes("--method")) {
    return args[args.indexOf("--method") + 1];
  }
  return "GET";
}

function bodyOf(args) {
  return String(args.find((value) => String(value).startsWith(BODY_PREFIX))).slice(BODY_PREFIX.length);
}

// POST creates a comment and PATCH rewrites one; any other method is a read and returns null.
function answerWrite(state, { method, endpoint, args }) {
  if (method === "POST") {
    state.comments.push({ id: state.nextId, body: bodyOf(args) });
    state.nextId += 1;
    state.writes.push({ method, endpoint });
    return reply({ id: state.nextId - 1 });
  }
  if (method === "PATCH") {
    state.comments.find((comment) => comment.id === Number(endpoint.split("/").pop())).body = bodyOf(args);
    state.writes.push({ method, endpoint });
    return reply({});
  }
  return null;
}

function checkRunsReply(state, sha) {
  const run = { name: "build-test", head_sha: sha, status: "completed", conclusion: state.checkConclusion };
  return reply([{ total_count: 1, check_runs: [run] }]);
}

const SHA_READS = [
  [CHECK_RUNS, checkRunsReply],
  [COMMIT_STATUS, (_state, sha) => reply([{ sha, state: "success", statuses: [] }])],
];

function shaRead(state, endpoint) {
  for (const [pattern, answer] of SHA_READS) {
    const sha = endpoint.match(pattern)?.[1];
    if (sha) {
      return answer(state, sha);
    }
  }
  return null;
}

function exactReads(state) {
  return new Map([
    [`repos/${REPO}`, () => ({ default_branch: state.defaultBranch })],
    [`repos/${REPO}/pulls/${PULL}`, () => state.pull],
    [`repos/${REPO}/issues/${ISSUE}`, () => state.issue],
    [`repos/${REPO}/branches/main/protection/required_status_checks`, () => ({ contexts: ["build-test"] })],
  ]);
}

function answerRead(state, endpoint) {
  const exact = exactReads(state).get(endpoint);
  if (exact) {
    return reply(exact());
  }
  return shaRead(state, endpoint) ?? NOT_FOUND;
}

// The runner answers every gh call from state. Only the comments read answers with the comment list; the
// check-run and status reads also slurp pages.
function runnerOf(state) {
  return (args) => {
    state.calls.push(args);
    const endpoint = String(args.find((value) => REPOS_PATH.test(String(value))));
    if (args.includes("--slurp") && ISSUE_COMMENTS.test(endpoint)) {
      return reply([state.comments]);
    }
    return answerWrite(state, { method: methodOf(args), endpoint, args }) ?? answerRead(state, endpoint);
  };
}

export { HEAD, ISSUE, MERGE, PULL, REPO, runnerOf };
