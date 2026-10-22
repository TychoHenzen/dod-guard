import assert from "node:assert/strict";
import test from "node:test";
import { isLinkedProjectRead } from "../../../../lib/linked-project-read.mjs";
import { buildClosureSnapshot } from "./closure-snapshot.mjs";
import {
  ENDPOINT,
  fakeRest,
  linkedProjectNode,
  linkedProjectsReply,
  SERVER_ERROR,
} from "./closure-snapshot.test-support.mjs";
import { buildFailureWith, failedAt } from "./fixtures/closure-snapshot-cli.mjs";
import { HEAD } from "./fixtures/closure-snapshot-pages.mjs";
import { build, fixtureRoutes } from "./fixtures/closure-snapshot-routes.mjs";
import { OWNER, ok, REPO } from "./fixtures/rest-shapes.mjs";

const OWNER_LISTING = /projectsV2\?/u;
const MEMBERSHIP_READ = /projectsV2\/\d+\/items\?per_page=100$/u;

// Matches the body and field flags in each spelling: -f or -F with the value joined, --field,
// --raw-field, and --input, each with or without a following =.
const BODY_FLAG = /^(?:-[fF]|--(?:raw-)?field(?:=|$)|--input(?:=|$))/u;

// The method each -X VALUE, --method VALUE, -XVALUE, and --method=VALUE argument names.
// The first matching reader wins, which is the original order.
const METHOD_READERS = [
  (arg, next) => (arg === "-X" || arg === "--method" ? [next] : null),
  (arg) => (arg.startsWith("--method=") ? [arg.slice("--method=".length)] : null),
  (arg) => (arg.startsWith("-X") && arg.length > 2 ? [arg.slice(2)] : null),
];

function methodsOf(args) {
  return args.flatMap((arg, index) => {
    for (const read of METHOD_READERS) {
      const found = read(arg, args[index + 1]);
      if (found !== null) {
        return found;
      }
    }
    return [];
  });
}

test("methodsOf reads each spelling of a method flag", () => {
  const args = ["api", "-X", "POST", "--method", "PUT", "--method=PATCH", "-XDELETE", "-X"];
  assert.deepEqual(methodsOf(args), ["POST", "PUT", "PATCH", "DELETE", undefined]);
  assert.deepEqual(methodsOf(["api", "users/x"]), []);
});

test("AC-05: every read is a GET but the linked-Project read, and only the reads the counts require are made", () => {
  const { runner, calls } = fakeRest(fixtureRoutes());
  buildClosureSnapshot({ repository: REPO, runner });
  // gh api graphql always posts its query, so the documented read-only query is
  // the one exemption.
  assert.equal(calls.filter(isLinkedProjectRead).length, 1);
  for (const args of calls.filter((call) => !isLinkedProjectRead(call))) {
    assert.equal(args[0], "api", args.join(" "));
    assert.notEqual(args[1], "graphql", args.join(" "));
    assert.ok(!args.some((arg) => BODY_FLAG.test(arg)), args.join(" "));
    for (const method of methodsOf(args)) {
      assert.equal(method, "GET", args.join(" "));
    }
  }
  const endpoints = calls.map((args) => args.at(-1));
  assert.ok(endpoints.includes(ENDPOINT.subIssues(10)), "the sub-issue read for #10 is missing");
  assert.ok(endpoints.includes(ENDPOINT.comments(10)), "the comment read for #10 is missing");
  for (const number of [11, 12]) {
    assert.ok(!endpoints.includes(ENDPOINT.subIssues(number)), `a sub-issue read was made for #${number}`);
    assert.ok(!endpoints.includes(ENDPOINT.comments(number)), `a comment read was made for #${number}`);
  }
  assert.ok(!endpoints.some((endpoint) => endpoint.includes("projectsV2/3/")), "the closed Project was read");
  assert.ok(!endpoints.includes(ENDPOINT.checkRuns(HEAD[22])), "an open pull request was checked");
});

test("the snapshot resolves its Project from the explicit link with one GraphQL read and no listing", () => {
  const { runner, calls } = fakeRest(fixtureRoutes());
  buildClosureSnapshot({ repository: REPO, runner });
  const graphql = calls.filter((args) => args.includes("graphql"));
  assert.equal(graphql.length, 1);
  assert.equal(isLinkedProjectRead(graphql[0]), true);
  const [read] = graphql;
  const ownerArg = `owner=${OWNER}`;
  const named = read.includes(ownerArg) && read.includes("name=dod-guard");
  assert.ok(named, read.join(" "));
  const endpoints = calls.map((args) => args.at(-1));
  const wasRead = (pattern) => endpoints.some((path) => pattern.test(path));
  assert.ok(!wasRead(OWNER_LISTING), "an owner-level Project listing was read");
  assert.ok(!wasRead(MEMBERSHIP_READ), "a membership read was made");
});

test("a freshly linked Project with no items still resolves, because the link decides and not membership", () => {
  const routes = fixtureRoutes();
  const snapshot = build({ ...routes, [ENDPOINT.values(2)]: ok([[]]) });
  assert.equal(snapshot.project.number, 2);
  assert.deepEqual(snapshot.items, []);
});

test("an Organization-owned linked Project is read under orgs/<login>", () => {
  const orgFields = "orgs/acme/projectsV2/2/fields?per_page=100";
  const owner = { typename: "Organization", login: "acme" };
  const orgProject = linkedProjectNode(2, owner);
  const error = buildFailureWith({
    [ENDPOINT.linkedProjects]: linkedProjectsReply([orgProject]),
  });
  const expected = `${failedAt(orgFields)} no fixture for ${orgFields}`;
  assert.equal(error?.message, expected);
});

test("fakeRest rejects other GraphQL, names the failing reply, and honors accepted exit codes", () => {
  const body = { status: 1, stdout: "boom", stderr: "" };
  const bare = { status: 1, stdout: "", stderr: "" };
  const { runner } = fakeRest({ a: SERVER_ERROR, b: body, c: bare });
  assert.throws(() => runner(["api", "graphql", "-f", "query=x"]), {
    message: "forbidden GraphQL request: api graphql -f query=x",
  });
  assert.throws(() => runner(["api", "a"]), { message: "gh: Server Error (HTTP 500)" });
  assert.throws(() => runner(["api", "b"]), { message: "boom" });
  assert.throws(() => runner(["api", "c"]), { message: "gh exited with 1" });
  assert.throws(() => runner(["api", "missing"]), { message: "no fixture for missing" });
  assert.equal(runner(["api", "c"], [0, 1]), bare);
});
