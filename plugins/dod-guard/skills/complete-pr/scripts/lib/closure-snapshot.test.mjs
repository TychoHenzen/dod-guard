import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCli } from "../closure.mjs";
import { statusValueName } from "../project-status.mjs";
import { planClosures } from "./closure-plan.mjs";
import { buildClosureSnapshot } from "./closure-snapshot.mjs";
import {
  BASE_SHA,
  ENDPOINT,
  FOREIGN,
  MERGED_AT,
  NOT_FOUND,
  OWNER,
  REPO,
  REPO_URL,
  SERVER_ERROR,
  checkRunsReply,
  commitStatusReply,
  fakeRest,
  fieldPages,
  issueContent,
  ok,
  projectItem,
  pull,
} from "./closure-snapshot.test-support.mjs";

const HEAD = { 21: "a1".repeat(20), 22: "a2".repeat(20), 23: "a3".repeat(20) };
const MERGE = { 21: "b1".repeat(20), 23: "b3".repeat(20) };
const EPIC_BODY = "## Acceptance criteria\n\n- [ ] Sub-issue #11 delivers the rule\n- [ ] Sub-issue #12 documents it\n";
const COMMENT_BODY = "Handoff note that quotes no completion record.";
const CHECKS = [
  { bucket: "pass", name: "build-test", state: "SUCCESS" },
  { bucket: "pass", name: "lint", state: "SUCCESS" },
];
const ERROR_PREFIX = /^closure snapshot read failed: /u;
const DISAGREE = /disagree/u;
const BLANK = /blank/u;
const NOT_A_NAME = /not a name/u;
const MISSING_BODY = /must carry body/u;
const USAGE_LINE = /closure\.mjs snapshot --repository=<owner\/name> --output=<file\.json>/u;

// Two --slurp pages in Project order. PVTI_f11 is a foreign issue whose number matches target issue
// #11. PVTI_t12 also links a foreign pull request: the item keeps that link, but the snapshot never
// lists it as a pull request record of the target repository.
function valuePages() {
  return [
    [
      projectItem("PVTI_t10", 1010, issueContent(10, { body: EPIC_BODY, subIssues: 2, comments: 1 })),
      projectItem("PVTI_f11", 1011, issueContent(11, { repo: FOREIGN })),
    ],
    [
      projectItem("PVTI_t11", 1111, issueContent(11, { state: "closed", stateReason: "completed", parent: 10 }), {
        status: "Done",
        parent: 10,
        linked: [pull(21, { sha: HEAD[21], mergeCommit: MERGE[21] })],
      }),
      projectItem("PVTI_t12", 1112, issueContent(12, { parent: 10 }), {
        status: "Todo",
        parent: 10,
        linked: [
          pull(23, { sha: HEAD[23], mergeCommit: MERGE[23] }),
          pull(22, { sha: HEAD[22], state: "open", merged: false }),
          pull(77, { repo: FOREIGN, sha: "d7".repeat(20), state: "open", merged: false }),
        ],
      }),
    ],
  ];
}

// Project 3 is closed and holds a target item, so it must never be read. Project 4 is open and holds
// only a foreign item, so it is read for membership and never linked.
const PROJECTS = [[{ number: 2, state: "open" }, { number: 3, state: "closed" }, { number: 4, state: "open" }]];

function setStatus(pages, nodeId, value) {
  const entry = pages.flat().find((item) => item.node_id === nodeId);
  entry.fields.find((field) => field.name === "Status").value = value;
}

function withoutKey(pages, nodeId, key) {
  const entry = pages.flat().find((item) => item.node_id === nodeId);
  delete entry.content[key];
}

// The healthy fixture, or one deliberate departure named by variant.
function fixtureRoutes(variant = "healthy") {
  const pages = valuePages();
  if (variant === "contradictory-status") {
    setStatus(pages, "PVTI_t11", { id: "opt-done", name: { raw: "Done", html: "Todo" } });
  }
  if (variant === "blank-status") {
    setStatus(pages, "PVTI_t11", { id: "opt-done", name: { raw: "", html: "" } });
  }
  // Mutations must run before the routes below call ok(), which serializes its value at that moment.
  if (variant === "absent-parent-url") {
    withoutKey(pages, "PVTI_t10", "parent_issue_url");
  }
  if (variant === "missing-body") {
    withoutKey(pages, "PVTI_t11", "body");
  }
  const routes = {
    [ENDPOINT.repository]: ok({ full_name: REPO, default_branch: "master" }),
    [ENDPOINT.projects]: ok(PROJECTS),
    [ENDPOINT.membership(2)]: ok(pages),
    [ENDPOINT.membership(4)]: ok([[projectItem("PVTI_f40", 1040, issueContent(40, { repo: FOREIGN }))]]),
    [ENDPOINT.fields(2)]: ok(fieldPages()),
    [ENDPOINT.values(2)]: ok(pages),
    [ENDPOINT.subIssues(10)]: ok([[{ number: 11, repository_url: REPO_URL }, { number: 12, repository_url: REPO_URL }]]),
    [ENDPOINT.comments(10)]: ok([[{ id: 9001, body: COMMENT_BODY }]]),
    [ENDPOINT.protection]: ok({ contexts: ["build-test", "lint"] }),
    [ENDPOINT.checkRuns(HEAD[21])]: checkRunsReply(HEAD[21]),
    [ENDPOINT.statuses(HEAD[21])]: commitStatusReply(HEAD[21]),
    [ENDPOINT.checkRuns(HEAD[23])]: checkRunsReply(HEAD[23]),
    [ENDPOINT.statuses(HEAD[23])]: commitStatusReply(HEAD[23]),
  };
  if (variant === "repository") {
    routes[ENDPOINT.repository] = SERVER_ERROR;
  }
  if (variant === "items") {
    routes[ENDPOINT.values(2)] = SERVER_ERROR;
  }
  if (variant === "missing-page") {
    routes[ENDPOINT.values(2)] = ok([pages[0], { message: "Not Found" }]);
  }
  if (variant === "no-parent-field") {
    routes[ENDPOINT.fields(2)] = ok(fieldPages({ withParent: false }));
  }
  if (variant === "no-linked-project") {
    routes[ENDPOINT.membership(2)] = ok([[projectItem("PVTI_f11", 1011, issueContent(11, { repo: FOREIGN }))]]);
  }
  if (variant === "two-linked-projects") {
    routes[ENDPOINT.membership(4)] = ok(pages);
  }
  if (variant === "protection-failure") {
    routes[ENDPOINT.protection] = SERVER_ERROR;
  }
  if (variant === "no-protection") {
    routes[ENDPOINT.protection] = NOT_FOUND;
  }
  return routes;
}

function build(routes) {
  return buildClosureSnapshot({ repository: REPO, runner: fakeRest(routes).runner });
}

// Returns the error a build throws, or null when the build succeeds.
function buildFailure(routes) {
  try {
    build(routes);
  } catch (error) {
    return error;
  }
  return null;
}

async function withTempDir(work) {
  const dir = await mkdtemp(join(tmpdir(), "closure-snapshot-"));
  try {
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function capture() {
  const text = { out: "", err: "" };
  return {
    text,
    stdout: {
      write: (chunk) => {
        text.out += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        text.err += chunk;
      },
    },
  };
}

function runSnapshot(dir, variant) {
  const io = capture();
  const output = join(dir, "snapshot.json");
  const code = runCli(["snapshot", `--repository=${REPO}`, `--output=${output}`], {
    runner: fakeRest(fixtureRoutes(variant)).runner,
    ...io,
  });
  return { code, stdout: io.text.out, stderr: io.text.err, output };
}

test("AC-05: the snapshot has the documented top-level keys and the project object", () => {
  const snapshot = build(fixtureRoutes());
  assert.deepEqual(Object.keys(snapshot), ["repository", "defaultBranch", "project", "items", "issues", "pullRequests"]);
  assert.equal(snapshot.repository, REPO);
  assert.equal(snapshot.defaultBranch, "master");
  assert.deepEqual(Object.keys(snapshot.project), ["owner", "number", "statusFieldId", "doneOptionId"]);
  assert.deepEqual(snapshot.project, {
    owner: OWNER,
    number: 2,
    statusFieldId: "PVTSSF_status",
    doneOptionId: "opt-done",
  });
});

test("AC-05: items hold both pages and both repositories, each with a top-level repository", () => {
  const snapshot = build(fixtureRoutes());
  assert.deepEqual(Object.keys(snapshot.items[0]), ["id", "databaseId", "contentType", "repository", "content", "fields"]);
  assert.deepEqual(snapshot.items, [
    {
      id: "PVTI_t10",
      databaseId: 1010,
      contentType: "Issue",
      repository: REPO,
      content: { number: 10, repository: REPO },
      fields: [
        { name: "Status", value: "Backlog" },
        { name: "Repository", value: REPO },
        { name: "Parent issue", value: null },
        { name: "Linked pull requests", value: [] },
      ],
    },
    {
      id: "PVTI_f11",
      databaseId: 1011,
      contentType: "Issue",
      repository: FOREIGN,
      content: { number: 11, repository: FOREIGN },
      fields: [
        { name: "Status", value: "Backlog" },
        { name: "Repository", value: FOREIGN },
        { name: "Parent issue", value: null },
        { name: "Linked pull requests", value: [] },
      ],
    },
    {
      id: "PVTI_t11",
      databaseId: 1111,
      contentType: "Issue",
      repository: REPO,
      content: { number: 11, repository: REPO },
      fields: [
        { name: "Status", value: "Done" },
        { name: "Repository", value: REPO },
        { name: "Parent issue", value: { repository: REPO, number: 10 } },
        { name: "Linked pull requests", value: [{ repository: REPO, number: 21 }] },
      ],
    },
    {
      id: "PVTI_t12",
      databaseId: 1112,
      contentType: "Issue",
      repository: REPO,
      content: { number: 12, repository: REPO },
      fields: [
        { name: "Status", value: "Todo" },
        { name: "Repository", value: REPO },
        { name: "Parent issue", value: { repository: REPO, number: 10 } },
        {
          name: "Linked pull requests",
          value: [
            { repository: REPO, number: 23 },
            { repository: REPO, number: 22 },
            { repository: FOREIGN, number: 77 },
          ],
        },
      ],
    },
  ]);
});

test("AC-05: issues list only target records, with children and parent as repository and number", () => {
  const snapshot = build(fixtureRoutes());
  assert.deepEqual(Object.keys(snapshot.issues[0]), [
    "number",
    "repository",
    "state",
    "state_reason",
    "title",
    "body",
    "parent",
    "children",
    "comments",
  ]);
  assert.deepEqual(snapshot.issues, [
    {
      number: 10,
      repository: REPO,
      state: "open",
      state_reason: null,
      title: "Issue 10",
      body: EPIC_BODY,
      parent: null,
      children: [
        { repository: REPO, number: 11 },
        { repository: REPO, number: 12 },
      ],
      comments: [{ id: 9001, body: COMMENT_BODY }],
    },
    {
      number: 11,
      repository: REPO,
      state: "closed",
      state_reason: "completed",
      title: "Issue 11",
      body: "",
      parent: { repository: REPO, number: 10 },
      children: [],
      comments: [],
    },
    {
      number: 12,
      repository: REPO,
      state: "open",
      state_reason: null,
      title: "Issue 12",
      body: "",
      parent: { repository: REPO, number: 10 },
      children: [],
      comments: [],
    },
  ]);
});

test("AC-05: an issue whose content omits parent_issue_url has no parent", () => {
  const snapshot = build(fixtureRoutes("absent-parent-url"));
  assert.equal(snapshot.issues.find((issue) => issue.number === 10).parent, null);
  assert.deepEqual(snapshot, build(fixtureRoutes()));
});

test("AC-05: an issue whose content omits body stops the build and names the issue", () => {
  const error = buildFailure(fixtureRoutes("missing-body"));
  assert.ok(error, "the build should have failed");
  assert.match(error.message, ERROR_PREFIX);
  assert.ok(error.message.includes(`repos/${REPO}/issues/11`), error.message);
  assert.match(error.message, MISSING_BODY);
});

test("AC-05: pull requests list only target records, and a merged one carries its required checks", () => {
  const snapshot = build(fixtureRoutes());
  assert.deepEqual(Object.keys(snapshot.pullRequests[0]), [
    "number",
    "repository",
    "state",
    "mergedAt",
    "head",
    "base",
    "mergeCommit",
    "requiredChecks",
  ]);
  assert.deepEqual(snapshot.pullRequests, [
    {
      number: 21,
      repository: REPO,
      state: "closed",
      mergedAt: MERGED_AT,
      head: { repository: REPO, ref: "codex/21", sha: HEAD[21] },
      base: { ref: "master", sha: BASE_SHA },
      mergeCommit: { oid: MERGE[21] },
      requiredChecks: CHECKS,
    },
    {
      number: 23,
      repository: REPO,
      state: "closed",
      mergedAt: MERGED_AT,
      head: { repository: REPO, ref: "codex/23", sha: HEAD[23] },
      base: { ref: "master", sha: BASE_SHA },
      mergeCommit: { oid: MERGE[23] },
      requiredChecks: CHECKS,
    },
    {
      number: 22,
      repository: REPO,
      state: "open",
      mergedAt: null,
      head: { repository: REPO, ref: "codex/22", sha: HEAD[22] },
      base: { ref: "master", sha: BASE_SHA },
      mergeCommit: null,
      requiredChecks: null,
    },
  ]);
});

test("AC-05: every read is a GET, and only the reads the counts require are made", () => {
  const { runner, calls } = fakeRest(fixtureRoutes());
  buildClosureSnapshot({ repository: REPO, runner });
  for (const args of calls) {
    assert.equal(args[0], "api", args.join(" "));
    assert.ok(!args.some((arg) => arg === "-f" || arg === "-F"), args.join(" "));
    if (args.includes("--method")) {
      assert.equal(args[args.indexOf("--method") + 1], "GET", args.join(" "));
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

test("AC-05: branch protection is read once for two merged pull requests on one base", () => {
  const { runner, calls } = fakeRest(fixtureRoutes());
  buildClosureSnapshot({ repository: REPO, runner });
  const endpoints = calls.map((args) => args.at(-1));
  assert.equal(endpoints.filter((endpoint) => endpoint === ENDPOINT.protection).length, 1);
  assert.equal(endpoints.filter((endpoint) => endpoint === ENDPOINT.checkRuns(HEAD[21])).length, 1);
});

test("AC-05: a branch with no protection reads as no required checks, not as a failure", () => {
  const snapshot = build(fixtureRoutes("no-protection"));
  const merged = snapshot.pullRequests.filter(({ mergedAt }) => mergedAt !== null);
  assert.deepEqual(
    merged.map(({ requiredChecks }) => requiredChecks),
    [[], []],
  );
});

test("AC-06: statusValueName reads one name from each REST spelling and rejects the rest", () => {
  assert.equal(statusValueName("Done"), "Done");
  assert.equal(statusValueName({ name: "Done" }), "Done");
  assert.equal(statusValueName({ id: "opt-done", name: { raw: "Done", html: "Done" } }), "Done");
  assert.equal(statusValueName(null), null);
  assert.equal(statusValueName(undefined), null);
  assert.throws(() => statusValueName({ name: { raw: "Done", html: "Todo" } }), DISAGREE);
  assert.throws(() => statusValueName({ name: { raw: " ", html: " " } }), BLANK);
  assert.throws(() => statusValueName({ id: "opt-done" }), NOT_A_NAME);
});

test("AC-06: a Status spelled as {raw, html} becomes its name in the snapshot", () => {
  const snapshot = build(fixtureRoutes());
  assert.equal(snapshot.items.find((entry) => entry.id === "PVTI_t11").fields[0].value, "Done");
});

test("AC-06: a Status whose spellings disagree stops the build and names the item", () => {
  const error = buildFailure(fixtureRoutes("contradictory-status"));
  assert.ok(error, "the build should have failed");
  assert.match(error.message, ERROR_PREFIX);
  assert.ok(error.message.includes("PVTI_t11"), error.message);
  assert.ok(error.message.includes(ENDPOINT.values(2)), error.message);
});

test("AC-06: a blank Status name stops the build and names the item", () => {
  const error = buildFailure(fixtureRoutes("blank-status"));
  assert.ok(error, "the build should have failed");
  assert.ok(error.message.includes("PVTI_t11"), error.message);
  assert.ok(error.message.includes(ENDPOINT.values(2)), error.message);
});

test("AC-07: the built snapshot plans with no repository identity hold", () => {
  const plan = planClosures(build(fixtureRoutes()));
  const identityHolds = plan.holds.filter((hold) => hold.reasons.includes("repository identity missing"));
  assert.deepEqual(identityHolds, []);
});

const FAULTS = [
  ["repository", [ENDPOINT.repository]],
  ["items", [ENDPOINT.values(2)]],
  ["missing-page", [ENDPOINT.values(2), "missing page"]],
  ["no-parent-field", [ENDPOINT.fields(2), 'must include exactly one "Parent issue" field, found 0']],
  ["no-linked-project", ["users/TychoHenzen/projectsV2", "expected exactly one open linked Project, found none"]],
  [
    "two-linked-projects",
    ["users/TychoHenzen/projectsV2", "expected exactly one open linked Project, found 2 (#2, #4)"],
  ],
  ["protection-failure", [ENDPOINT.protection]],
];

for (const [variant, expected] of FAULTS) {
  test(`AC-11: ${variant} exits 1, names its endpoint, leaves no file, and recovers on rerun`, async () => {
    await withTempDir(async (dir) => {
      const failure = runSnapshot(dir, variant);
      assert.equal(failure.code, 1, failure.stderr);
      for (const text of expected) {
        assert.ok(failure.stderr.includes(text), `stderr lacks "${text}": ${failure.stderr}`);
      }
      assert.deepEqual(await readdir(dir), [], "a failed run left a file behind");

      const healthy = runSnapshot(dir, "healthy");
      assert.equal(healthy.code, 0, healthy.stderr);
      assert.deepEqual(JSON.parse(healthy.stdout), {
        output: healthy.output,
        repository: REPO,
        projectNumber: 2,
        items: 4,
        issues: 3,
        pullRequests: 3,
      });
      assert.deepEqual(JSON.parse(await readFile(healthy.output, "utf8")), build(fixtureRoutes()));
      assert.deepEqual(await readdir(dir), ["snapshot.json"]);
    });
  });
}

test("AC-11: a non-404 failure of the branch-protection read fails the run, not an empty requirement list", async () => {
  await withTempDir(async (dir) => {
    const failure = runSnapshot(dir, "protection-failure");
    assert.equal(failure.code, 1, failure.stderr);
    assert.ok(failure.stderr.includes(ENDPOINT.protection), failure.stderr);
    assert.deepEqual(await readdir(dir), []);
  });
});

test("AC-11: snapshot without a valid --repository or --output is a usage error", () => {
  const invalid = [
    ["snapshot", `--repository=${REPO}`],
    ["snapshot", "--output=snapshot.json"],
    ["snapshot", "--repository=not-a-repository", "--output=snapshot.json"],
  ];
  for (const argv of invalid) {
    const io = capture();
    const { runner, calls } = fakeRest(fixtureRoutes());
    assert.equal(runCli(argv, { runner, ...io }), 2, argv.join(" "));
    assert.match(io.text.err, USAGE_LINE);
    assert.deepEqual(calls, [], argv.join(" "));
  }
});
