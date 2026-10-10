import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "./closure.mjs";
import {
  DELIVERIES,
  FOREIGN_REPOSITORY,
  REPOSITORY,
  completionComment,
  fakeGitHub,
  holdOf,
  mergeResult,
  patchesTo,
  quotingComment,
  recordedSnapshot,
  supersedesBody,
} from "./lib/closure.test-support.mjs";
import {
  ENDPOINT,
  OWNER,
  checkRunsReply,
  commitStatusReply,
  fakeRest,
  fieldPages,
  issueContent,
  ok,
  projectItem,
  pull,
} from "./lib/closure-snapshot.test-support.mjs";

const SCRIPT = fileURLToPath(new URL("./closure.mjs", import.meta.url));

async function saved(name, value) {
  const directory = await mkdtemp(join(tmpdir(), "closure-"));
  const file = join(directory, name);
  await writeFile(file, JSON.stringify(value));
  return file;
}

function capture() {
  const text = { out: "", err: "" };
  return {
    text,
    stdout: { write: (chunk) => (text.out += chunk) },
    stderr: { write: (chunk) => (text.err += chunk) },
  };
}

test("the shipped plan command prints the planned close for a verified root", async () => {
  const file = await saved("snapshot.json", recordedSnapshot({ roots: [840] }));
  const run = spawnSync(process.execPath, [SCRIPT, "plan", `--snapshot=${file}`], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const plan = JSON.parse(run.stdout);
  assert.deepEqual(plan.closes.map(({ issue, rule }) => [issue, rule]), [[777, "replaced-original"]]);
});

test("the command rejects an unknown command or a missing flag", () => {
  const invalid = [
    [],
    ["close"],
    ["plan"],
    ["plan", "snapshot.json"],
    ["record", "--repository=a/b"],
    ["plan", "--snapshot=snapshot.json", "--hierarchy=epic"],
  ];
  for (const argv of invalid) {
    const io = capture();
    assert.equal(runCli(argv, io), 2, argv.join(" "));
    assert.match(io.text.err, /usage: closure\.mjs plan --snapshot=<file\.json>/);
  }
});

test("apply and record run through the injected gh runner", async () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot);
  const applyIo = capture();
  const snapshotFile = await saved("snapshot.json", snapshot);
  assert.equal(
    runCli(["apply", `--snapshot=${snapshotFile}`], { runner: github.runner, ...applyIo }),
    0,
    applyIo.text.err,
  );
  assert.deepEqual(JSON.parse(applyIo.text.out).applied, [777]);

  const result = mergeResult([840]);
  const recordIo = capture();
  const argv = [
    "record",
    `--repository=${REPOSITORY}`,
    `--result=${await saved("result.json", result)}`,
    `--matrix=${await saved("matrix.json", [{ id: "AC-01", status: "pass" }])}`,
  ];
  assert.equal(runCli(argv, { runner: github.runner, ...recordIo }), 0, recordIo.text.err);
  assert.deepEqual(JSON.parse(recordIo.text.out).records, [{ issue: 840, action: "unchanged" }]);
});

test("the shipped record command posts its own record and leaves a quoting handoff unchanged", async () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  snapshot.issues.find(({ number }) => number === 840).comments = [quotingComment(7001)];
  const github = fakeGitHub(snapshot);
  const handoff = github.state.issues.get(840).comments[0].body;
  const result = mergeResult([840]);
  const argv = [
    "record",
    `--repository=${REPOSITORY}`,
    `--result=${await saved("result.json", result)}`,
    `--matrix=${await saved("matrix.json", [{ id: "AC-01", status: "pass" }])}`,
  ];

  const first = capture();
  assert.equal(runCli(argv, { runner: github.runner, ...first }), 0, first.text.err);
  assert.deepEqual(JSON.parse(first.text.out).records, [{ issue: 840, action: "posted" }]);
  assert.equal(github.state.issues.get(840).comments[0].body, handoff);
  assert.deepEqual(patchesTo(github, 7001), []);

  const second = capture();
  assert.equal(runCli(argv, { runner: github.runner, ...second }), 0, second.text.err);
  assert.deepEqual(JSON.parse(second.text.out).records, [{ issue: 840, action: "unchanged" }]);
  assert.equal(github.state.issues.get(840).comments[0].body, handoff);
  assert.deepEqual(patchesTo(github, 7001), []);
  assert.equal(github.state.issues.get(840).comments.length, 2);
});

test("record rejects a malformed --children list before any call", async () => {
  const result = await saved("result.json", {
    pullNumber: DELIVERIES[840].pull,
    trustedHead: DELIVERIES[840].head,
    mergeCommitSha: DELIVERIES[840].merge,
    linkedIssues: [{ number: 840 }],
  });
  const matrix = await saved("matrix.json", [{ id: "AC-01", status: "pass" }]);
  for (const flag of ["--children=12,abc", "--children=12,", "--children=0", "--children=-3", "--children"]) {
    const calls = [];
    const runner = (args) => {
      calls.push(args);
      return { status: 0, stdout: "", stderr: "" };
    };
    const io = capture();
    const argv = ["record", `--repository=${REPOSITORY}`, `--result=${result}`, `--matrix=${matrix}`, flag];
    assert.equal(runCli(argv, { runner, ...io }), 2, flag);
    assert.match(io.text.err, /usage: closure\.mjs plan --snapshot=<file\.json>/, flag);
    assert.deepEqual(calls, [], flag);
  }
});

// Names each gh call by what it does, folding runs of the same kind, so the
// order of one close reads as a sentence.
function callKinds(calls) {
  const kinds = calls.map((args) => {
    const method = args.includes("--method") ? args[args.indexOf("--method") + 1] : "GET";
    const project = args.some((value) => String(value).startsWith("users/"));
    if (project) return method === "GET" ? "project-read" : "project-status";
    if (method === "POST") return "comment";
    if (method === "PATCH") return "close";
    return "read";
  });
  return kinds.filter((kind, index) => kind !== kinds[index - 1]);
}

test("end to end: plan and apply on the #683 hierarchy", async () => {
  const snapshot = recordedSnapshot();
  const file = await saved("snapshot.json", snapshot);
  const run = spawnSync(process.execPath, [SCRIPT, "plan", `--snapshot=${file}`], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const plan = JSON.parse(run.stdout);
  assert.deepEqual(plan.closes.map(({ issue, rule, stateReason }) => [issue, rule, stateReason]), [
    [775, "replaced-original", "completed"],
    [776, "replaced-original", "completed"],
    [777, "replaced-original", "completed"],
    [778, "replaced-original", "completed"],
    [683, "parent", "completed"],
  ]);
  assert.deepEqual(plan.holds, []);
  assert.deepEqual(plan.reports, []);
  assert.deepEqual(plan.deliveries.map(({ root, status }) => [root, status]), [
    [818, "verified"],
    [820, "verified"],
    [840, "verified"],
    [841, "verified"],
  ]);

  const github = fakeGitHub(snapshot);
  const io = capture();
  assert.equal(runCli(["apply", `--snapshot=${file}`], { runner: github.runner, ...io }), 0, io.text.err);
  assert.deepEqual(JSON.parse(io.text.out).applied, [775, 776, 777, 778, 683]);
  const firstClose = github.calls.slice(
    0,
    github.calls.findIndex((args) => args.includes("PATCH") && String(args[3]).startsWith("users/")) + 2,
  );
  assert.deepEqual(callKinds(firstClose), [
    "read",
    "comment",
    "close",
    "read",
    "project-read",
    "project-status",
    "project-read",
  ]);
  for (const number of [775, 776, 777, 778, 683]) {
    assert.equal(github.state.issues.get(number).state, "closed");
    assert.equal(github.state.statuses.get(`PVTI_${number}`), "Done");
  }
});

test("end to end: the recorded state with #840 and #841 unmerged holds and reports", async () => {
  const snapshot = recordedSnapshot({ record: { 840: null, 841: null } });
  const run = spawnSync(process.execPath, [SCRIPT, "plan", `--snapshot=${await saved("snapshot.json", snapshot)}`], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const plan = JSON.parse(run.stdout);
  assert.deepEqual(plan.closes.map(({ issue }) => issue), [775, 776]);
  assert.deepEqual(plan.holds.map(({ issue }) => issue), [777, 778, 683]);
  assert.deepEqual(plan.reports.map(({ issue, kind }) => [issue, kind]), [
    [840, "unverified-closed"],
    [841, "unverified-closed"],
  ]);
});

test("a stop reports its partial state and exits 1", async () => {
  const snapshot = recordedSnapshot({ roots: [840] });
  const github = fakeGitHub(snapshot, { ignoreClose: true });
  const io = capture();
  assert.equal(
    runCli(["apply", `--snapshot=${await saved("snapshot.json", snapshot)}`], { runner: github.runner, ...io }),
    1,
  );
  assert.match(io.text.err, /closure apply failed: issue #777 readback disagrees with the planned close/);
  assert.match(io.text.err, /"state":"open"/);
});

test("apply runs on a snapshot built to the documented closure snapshot shape", async () => {
  const TOP_KEYS = ["repository", "defaultBranch", "project", "items", "issues", "pullRequests"];
  const PROJECT_KEYS = ["owner", "number", "statusFieldId", "doneOptionId"];
  const ITEM_KEYS = ["id", "content", "fields"];
  const ISSUE_KEYS = [
    "number",
    "repository",
    "state",
    "title",
    "parent",
    "children",
    "body",
    "state_reason",
    "comments",
  ];
  const PULL_KEYS = ["number", "repository", "state", "mergedAt", "head", "base", "mergeCommit", "requiredChecks"];
  const ADDED_BY_STANDARD = ["children", "body", "state_reason", "comments", "statusFieldId", "doneOptionId"];
  const pick = (record, keys) =>
    Object.fromEntries(keys.filter((key) => key in record).map((key) => [key, record[key]]));
  const standard = await readFile(new URL("../../../standards/project-workflow.md", import.meta.url), "utf8");
  for (const key of [...ISSUE_KEYS, ...PROJECT_KEYS].filter((name) => ADDED_BY_STANDARD.includes(name))) {
    assert.ok(standard.includes("`" + key + "`"), key);
  }
  const snapshot = recordedSnapshot();
  const documented = pick(snapshot, TOP_KEYS);
  documented.project = pick(snapshot.project, PROJECT_KEYS);
  documented.items = snapshot.items.map((entry) => pick(entry, ITEM_KEYS));
  documented.issues = snapshot.issues.map((entry) => pick(entry, ISSUE_KEYS));
  documented.pullRequests = snapshot.pullRequests.map((entry) => pick(entry, PULL_KEYS));
  const github = fakeGitHub(documented);
  const io = capture();
  const file = await saved("snapshot.json", documented);
  assert.equal(runCli(["apply", `--snapshot=${file}`], { runner: github.runner, ...io }), 0, io.text.err);
  assert.deepEqual(JSON.parse(io.text.out).applied, [775, 776, 777, 778, 683]);
  for (const number of [775, 776, 777, 778, 683]) {
    assert.equal(github.state.statuses.get(`PVTI_${number}`), "Done");
  }
});

// The round trip: a snapshot the real builder makes from REST reads feeds plan, apply, annotate, and
// select-next unchanged. Each fixture is what GitHub would answer for one linked Project.
const ROOT = 840;
const ORIGINAL = DELIVERIES[ROOT].replaces;
const BEEHAIVE = "TychoHenzen/BeeHAIve";
const ONE_OPEN_PROJECT = [[{ number: 2, state: "open" }]];
const STATUS_OPTIONS = fieldPages()[0][0].options;
const SELECT_NEXT = fileURLToPath(new URL("../../goal-sdlc/scripts/select-next.mjs", import.meta.url));
const ENDPOINT_PATH = /^(repos|users)\//;
const ISSUE_PATH = /\/issues\/(\d+)/;

// Writes the snapshot through runCli(["snapshot"]) and reads the file back, so every later stage
// receives exactly what the builder wrote.
async function builtSnapshot(routes) {
  const directory = await mkdtemp(join(tmpdir(), "closure-round-trip-"));
  const file = join(directory, "snapshot.json");
  const io = capture();
  const code = runCli(["snapshot", `--repository=${REPOSITORY}`, `--output=${file}`], {
    runner: fakeRest(routes).runner,
    ...io,
  });
  if (code !== 0) {
    throw new Error(`closure snapshot failed: ${io.text.err}`);
  }
  return { file, snapshot: JSON.parse(await readFile(file, "utf8")) };
}

function closureJson(argv, runner) {
  const io = capture();
  if (runCli(argv, { runner, ...io }) !== 0) {
    throw new Error(`closure ${argv[0]} failed: ${io.text.err}`);
  }
  return JSON.parse(io.text.out);
}

async function selectNextOf(snapshot) {
  const file = await saved("annotated.json", snapshot);
  const run = spawnSync(process.execPath, [SELECT_NEXT, `--snapshot=${file}`], { encoding: "utf8" });
  if (run.status !== 0) {
    throw new Error(`select-next failed: ${run.stderr}`);
  }
  return JSON.parse(run.stdout);
}

function argValue(args, prefix) {
  return args.find((value) => String(value).startsWith(prefix))?.slice(prefix.length);
}

// The base routes of a linked-Project fixture: the repository, the one open Project, and the
// membership, fields, and values reads of that Project over the given item pages.
function projectRoutes(pages) {
  return {
    [ENDPOINT.repository]: ok({ full_name: REPOSITORY, default_branch: "master" }),
    [ENDPOINT.projects]: ok(ONE_OPEN_PROJECT),
    [ENDPOINT.membership(2)]: ok(pages),
    [ENDPOINT.fields(2)]: ok(fieldPages()),
    [ENDPOINT.values(2)]: ok(pages),
  };
}

// A verified delivery: merged root #840 (PR #901) supersedes open original #777, and its completion
// record matches the live pull request. Plan has exactly one close to make.
function deliveredFixture() {
  const root = DELIVERIES[ROOT];
  const rootPull = pull(root.pull, { sha: root.head, mergeCommit: root.merge });
  const rootComment = completionComment(ROOT);
  const rootIssue = issueContent(ROOT, {
    state: "closed",
    stateReason: "completed",
    body: supersedesBody([ORIGINAL]),
    comments: 1,
  });
  const pages = [
    [
      projectItem(`PVTI_${ORIGINAL}`, 7771, issueContent(ORIGINAL), { status: "Backlog" }),
      projectItem(`PVTI_${ROOT}`, 8401, rootIssue, { status: "Done", linked: [rootPull] }),
    ],
  ];
  return {
    pages,
    pulls: [rootPull],
    issues: [
      { number: ORIGINAL, state: "open", state_reason: null, comments: [] },
      { number: ROOT, state: "closed", state_reason: "completed", comments: [rootComment] },
    ],
    routes: {
      ...projectRoutes(pages),
      [ENDPOINT.comments(ROOT)]: ok([[rootComment]]),
      [ENDPOINT.protection]: ok({ contexts: ["build-test"] }),
      [ENDPOINT.checkRuns(root.head)]: checkRunsReply(root.head),
      [ENDPOINT.statuses(root.head)]: commitStatusReply(root.head),
    },
  };
}

// A cross-repository delivery group: #20 has sub-issue DeepSeekCustom#21 and #32 has parent BeeHAIve#31,
// while target issues #21 and #31 exist under the same numbers. A classifier that grouped by bare number
// would join them, and this test proves it does not.
function crossRepositoryFixture() {
  const pages = [
    [
      projectItem("PVTI_20", 2020, issueContent(20, { subIssues: 1 }), { status: "Backlog" }),
      projectItem("PVTI_21", 2021, issueContent(21), { status: "Todo" }),
      projectItem("PVTI_31", 3131, issueContent(31), { status: "Backlog" }),
      projectItem("PVTI_32", 3232, issueContent(32, { parent: 31, parentRepo: BEEHAIVE }), {
        status: "Backlog",
        parent: 31,
        parentRepo: BEEHAIVE,
      }),
    ],
  ];
  const foreignSubIssue = { number: 21, repository_url: `https://api.github.com/repos/${FOREIGN_REPOSITORY}` };
  return {
    routes: {
      ...projectRoutes(pages),
      [ENDPOINT.subIssues(20)]: ok([[foreignSubIssue]]),
    },
  };
}

// Answers the closure writes and the Project reads that project-status.mjs makes, from the fixture the
// builder read. A Project item PATCH changes that item's Status, so a later readback sees the change.
function appliedGitHub({ pages, issues, pulls }) {
  const state = {
    items: pages.flat(),
    issues: new Map(issues.map((issue) => [issue.number, structuredClone(issue)])),
    pulls: new Map(pulls.map((record) => [record.number, record])),
    nextComment: 9000,
  };
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    const endpoint = String(args.find((value) => ENDPOINT_PATH.test(String(value))));
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

// The Project reads, and the Status write, that project-status.mjs makes.
function projectReply(state, args, endpoint) {
  const project = `users/${OWNER}/projectsV2/2`;
  if (endpoint === project) {
    return ok({ node_id: "PVT_round" });
  }
  if (endpoint.startsWith(`${project}/fields`)) {
    return ok(fieldPages());
  }
  if (endpoint.startsWith(`${project}/items?`)) {
    return ok([state.items]);
  }
  const item = state.items.find(({ id }) => String(id) === endpoint.slice(`${project}/items/`.length));
  const option = STATUS_OPTIONS.find(({ id }) => id === argValue(args, "fields[][value]="));
  if (item === undefined || option === undefined) {
    return { status: 1, stdout: "", stderr: `no Project item or option in ${endpoint}` };
  }
  item.fields.find(({ id }) => id === 101).value = { id: option.id, name: option.name };
  return ok({});
}

// The closure reads and writes on one issue: its record, its comments, and its close.
function issueReply(state, args, endpoint) {
  const method = args.includes("--method") ? args[args.indexOf("--method") + 1] : "GET";
  const issue = state.issues.get(Number(ISSUE_PATH.exec(endpoint)?.[1]));
  if (!issue) {
    return { status: 1, stdout: "", stderr: `no issue in ${endpoint}` };
  }
  if (method === "POST") {
    issue.comments.push({ id: state.nextComment, body: argValue(args, "body=") });
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
  return ok({ number: issue.number, state: issue.state, state_reason: issue.state_reason });
}

test("AC-07: a built snapshot plans one verified close, applies it, and sets the original Done", async () => {
  const fixture = deliveredFixture();
  const { file } = await builtSnapshot(fixture.routes);

  const plan = closureJson(["plan", `--snapshot=${file}`]);
  assert.deepEqual(
    plan.closes.map(({ issue, rule, root, pullRequest, stateReason }) => [issue, rule, root, pullRequest, stateReason]),
    [[ORIGINAL, "replaced-original", ROOT, DELIVERIES[ROOT].pull, "completed"]],
  );
  assert.deepEqual([plan.holds, plan.reports, plan.statusRepairs], [[], [], []]);

  const github = appliedGitHub(fixture);
  const applied = closureJson(["apply", `--snapshot=${file}`], github.runner);
  assert.deepEqual(applied.applied, [ORIGINAL]);
  const projectWrites = github.calls.filter(
    (args) =>
      args.includes("PATCH") && args.some((value) => String(value).startsWith(`users/${OWNER}/projectsV2/2/items/`)),
  );
  assert.deepEqual(projectWrites, [
    [
      "api",
      "--method",
      "PATCH",
      `users/${OWNER}/projectsV2/2/items/7771`,
      "-F",
      "fields[][id]=101",
      "-f",
      "fields[][value]=opt-done",
    ],
  ]);
  assert.equal(github.issues.get(ORIGINAL).state, "closed");
  assert.equal(github.issues.get(ORIGINAL).state_reason, "completed");
  assert.equal(github.issues.get(ORIGINAL).comments.length, 1);
  const status = github.items.find(({ node_id }) => node_id === `PVTI_${ORIGINAL}`).fields.find(({ id }) => id === 101);
  assert.equal(status.value.name.raw, "Done");
});

test("AC-03: a built delivery annotates to a complete group, and select-next reports no missing evidence", async () => {
  const { file } = await builtSnapshot(deliveredFixture().routes);
  const result = await selectNextOf(closureJson(["annotate", `--snapshot=${file}`]));
  assert.deepEqual(result.missingEvidence, []);
  assert.deepEqual(result.counts.missingEvidence, []);
  assert.equal(result.counts.balanced, true);
  assert.deepEqual(result.groups.find(({ rootIssueNumber }) => rootIssueNumber === ROOT), {
    rootIssueNumber: ROOT,
    kind: "complete",
    reasons: [],
  });
  assert.deepEqual(result.selected.issueNumbers, [ORIGINAL]);
});

test("AC-03: select-next holds #20 and #32 in their own groups and leaves #31 eligible", async () => {
  const { file, snapshot } = await builtSnapshot(crossRepositoryFixture().routes);
  assert.deepEqual(snapshot.issues.find(({ number }) => number === 20).children, [
    { repository: FOREIGN_REPOSITORY, number: 21 },
  ]);
  assert.deepEqual(snapshot.issues.find(({ number }) => number === 32).parent, { repository: BEEHAIVE, number: 31 });

  const plan = closureJson(["plan", `--snapshot=${file}`]);
  assert.deepEqual(plan.closes, []);
  assert.deepEqual(holdOf(plan, 20).reasons, ["cross-repository sub-issue TychoHenzen/DeepSeekCustom#21"]);
  assert.deepEqual(holdOf(plan, 32).reasons, ["cross-repository parent TychoHenzen/BeeHAIve#31"]);

  const result = await selectNextOf(closureJson(["annotate", `--snapshot=${file}`]));
  const group = (root) => result.groups.find(({ rootIssueNumber }) => rootIssueNumber === root);
  assert.equal(group(20).kind, "hold");
  assert.ok(group(20).reasons.includes("cross-repository sub-issue TychoHenzen/DeepSeekCustom#21"));
  assert.equal(group(32).kind, "hold");
  assert.ok(group(32).reasons.includes("cross-repository parent TychoHenzen/BeeHAIve#31"));
  assert.deepEqual(group(31), { rootIssueNumber: 31, kind: "eligible", reasons: [] });
  assert.deepEqual(result.selected.issueNumbers, [21]);
});
