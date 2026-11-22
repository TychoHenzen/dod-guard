import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: the tests build a git checkout and a bare remote
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: the tests write the change folder and read written bodies
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: the checkout lives in the system temp directory
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: test paths are joined per platform
import { join } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderSliceBody } from "../../../lib/openspec-tasks.mjs";
import { applySync, planSync } from "./openspec-sync.mjs";

const REPOSITORY = "owner/game";
const PARENT = 42;
const SLICE = 101;
const PARENT_BODY = `## Why

Draws can pass the hand limit.

## Implementation notes

### task-list

\`\`\`json
[{"id": "T1", "title": "Describe the limit in the rules page", "parentLevel": "convergence", "independent": false, "dependsOn": []}]
\`\`\`
`;

let base;
let work;
let change;
let github;

function git(dir, ...args) {
  const result = spawnSync("git", ["-C", dir, "-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function commit(message) {
  writeFileSync(join(work, "src.txt"), `${message}\n`);
  git(work, "add", "src.txt");
  git(work, "commit", "-q", "-m", message);
}

function writeTasks(text) {
  writeFileSync(join(change, "tasks.md"), text);
}

const sliceCategories = (done) => [
  {
    category: "Domain rules",
    tasks: [
      { id: "1.1", text: "Refuse a draw past seven cards", done: done[0] },
      { id: "1.2", text: "Return the hand-full reason", done: done[1] },
    ],
  },
];

// An in-memory GitHub that answers the gh calls the sync makes and records every write.
function fakeGitHub(issues) {
  const writes = [];
  const reply = (data) => ({ status: 0, stdout: JSON.stringify(data), stderr: "" });
  const runner = (args) => {
    const path = args.find((arg) => arg.startsWith("repos/"));
    const number = Number(/issues\/(\d+)/.exec(path)[1]);
    if (path.endsWith("/sub_issues?per_page=100")) {
      return reply([issues[number].subIssues.map((child) => ({ number: child, ...issues[child] }))]);
    }
    if (!args.includes("PATCH")) return reply({ number, ...issues[number] });
    const fields = Object.fromEntries(
      args
        .filter((_, index) => args[index - 1] === "-f" || args[index - 1] === "-F")
        .map((field) => {
          const [key, value] = field.split(/[=](.*)/s);
          return [key, value.startsWith("@") ? readFileSync(value.slice(1), "utf8") : value];
        }),
    );
    writes.push({ number, fields });
    Object.assign(issues[number], fields);
    return reply({ number, ...issues[number] });
  };
  return { issues, writes, runner };
}

function sliceIssue(checked) {
  const categories = sliceCategories(checked);
  return { state: "open", body: renderSliceBody({ slice: "hand-size-limit", categories }, PARENT), subIssues: [] };
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "openspec-sync-test-"));
  const remote = join(base, "remote.git");
  work = join(base, "work");
  spawnSync("git", ["init", "-q", "--bare", remote]);
  mkdirSync(work);
  git(work, "init", "-q");
  git(work, "checkout", "-q", "-b", "codex/42-hand-size-limit");
  git(work, "remote", "add", "origin", remote);
  writeFileSync(join(work, ".gitignore"), "openspec/changes/\n");
  git(work, "add", ".gitignore");
  commit("start");
  git(work, "push", "-q", "-u", "origin", "codex/42-hand-size-limit");
  change = join(work, "openspec", "changes", "hand-size-limit");
  mkdirSync(change, { recursive: true });
  writeFileSync(join(change, "proposal.md"), "## Why\n\nDraws can pass the hand limit.\n");
  writeTasks(`## 1. Domain rules (slice: hand-size-limit)

- [x] 1.1 Refuse a draw past seven cards
- [x] 1.2 Return the hand-full reason

## 2. Docs

- [ ] 2.1 Describe the limit in the rules page
`);
  github = fakeGitHub({
    [PARENT]: { state: "open", body: PARENT_BODY, subIssues: [SLICE] },
    [SLICE]: sliceIssue([false, false]),
  });
});

afterEach(() => rmSync(base, { recursive: true, force: true }));

const options = () => ({ change, issue: PARENT, repository: REPOSITORY });

test("changes no issue and asks for a push when a finished slice has unpushed commits", () => {
  commit("refuse the draw");
  const plan = planSync(options(), { runner: github.runner });
  const applied = applySync(options(), { runner: github.runner });

  assert.equal(plan.code, 1);
  assert.equal(plan.out.status, "not-pushed");
  assert.match(plan.out.reason, /push/);
  assert.deepEqual(
    plan.out.ticks.map((tick) => tick.id),
    ["1.1", "1.2"],
  );
  assert.equal(applied.code, 1);
  assert.deepEqual(github.writes, []);
  assert.equal(github.issues[SLICE].state, "open");
});

test("ticks the items and closes the slice once the finished work is pushed", () => {
  commit("refuse the draw");
  git(work, "push", "-q");
  const plan = planSync(options(), { runner: github.runner });

  assert.equal(plan.code, 0, JSON.stringify(plan.out));
  assert.equal(plan.out.status, "ready");
  assert.deepEqual(plan.out.closes, [{ issue: SLICE, slice: "hand-size-limit" }]);

  const applied = applySync(options(), { runner: github.runner });

  assert.equal(applied.code, 0, JSON.stringify(applied.out));
  assert.deepEqual(applied.out.ticked, [{ issue: SLICE, ids: ["1.1", "1.2"] }]);
  assert.deepEqual(applied.out.closed, [SLICE]);
  assert.match(github.issues[SLICE].body, /^- \[x\] 1\.1 Refuse a draw past seven cards$/m);
  assert.match(github.issues[SLICE].body, /^- \[x\] 1\.2 Return the hand-full reason$/m);
  assert.equal(github.issues[SLICE].state, "closed");
  assert.equal(github.issues[SLICE].state_reason, "completed");
  assert.equal(github.writes.filter((write) => write.number === PARENT).length, 0);

  const again = planSync(options(), { runner: github.runner });
  assert.equal(again.out.status, "in-sync");
});

test("finds the task of a slice that has no sub-issue in the parent's task-list record", () => {
  writeTasks(`## 1. Docs (slice: rules-page)

- [x] 1.1 Describe the limit in the rules page

## 2. Tests (slice: draw-log)

- [ ] 2.1 Log every refused draw
`);
  const plan = planSync(options(), { runner: github.runner });

  assert.equal(plan.code, 0, JSON.stringify(plan.out));
  assert.equal(plan.out.status, "in-sync");
  assert.deepEqual(plan.out.unpublished, [{ slice: "draw-log", id: "2.1", text: "Log every refused draw" }]);
  assert.deepEqual(github.writes, []);
});

test("reports a task that the issue does not hold as unpublished and writes nothing for it", () => {
  writeTasks(`## 1. Domain rules (slice: hand-size-limit)

- [ ] 1.1 Refuse a draw past seven cards
- [ ] 1.2 Return the hand-full reason
- [x] 1.3 Log every refused draw

## 2. Docs

- [ ] 2.1 Describe the limit in the rules page
- [ ] 2.2 Add a changelog entry
`);
  const plan = planSync(options(), { runner: github.runner });
  const applied = applySync(options(), { runner: github.runner });

  assert.equal(plan.code, 0);
  assert.equal(plan.out.status, "in-sync");
  assert.deepEqual(plan.out.unpublished, [
    { slice: "hand-size-limit", id: "1.3", text: "Log every refused draw" },
    { slice: null, id: "2.2", text: "Add a changelog entry" },
  ]);
  assert.deepEqual(github.writes, []);
  assert.equal(applied.code, 0);
});

test("the command exits 2 with the usage for a bad mode or argument", () => {
  const script = fileURLToPath(new URL("./openspec-sync.mjs", import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  for (const args of [
    ["push", `--change=${change}`, "--issue=42", "--repository=owner/game"],
    ["plan", `--change=${change}`, "--issue=x", "--repository=owner/game"],
    ["plan", `--change=${change}`, "--issue=42"],
  ]) {
    const result = run(...args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^usage: node openspec-sync\.mjs/);
  }
});

test("never unticks an item ticked by hand and closes only when every item is ticked", () => {
  github.issues[SLICE] = sliceIssue([true, false]);
  writeTasks(`## 1. Domain rules (slice: hand-size-limit)

- [ ] 1.1 Refuse a draw past seven cards
- [ ] 1.2 Return the hand-full reason
`);
  const plan = planSync(options(), { runner: github.runner });

  assert.equal(plan.out.status, "in-sync");
  assert.deepEqual(plan.out.issueOnly, [{ issue: SLICE, slice: "hand-size-limit", id: "1.1" }]);
  assert.deepEqual(applySync(options(), { runner: github.runner }).code, 0);
  assert.deepEqual(github.writes, []);

  writeTasks(`## 1. Domain rules (slice: hand-size-limit)

- [ ] 1.1 Refuse a draw past seven cards
- [x] 1.2 Return the hand-full reason
`);
  const applied = applySync(options(), { runner: github.runner });

  assert.equal(applied.code, 0, JSON.stringify(applied.out));
  assert.match(github.issues[SLICE].body, /^- \[x\] 1\.1 /m);
  assert.match(github.issues[SLICE].body, /^- \[x\] 1\.2 /m);
  assert.equal(github.issues[SLICE].state, "closed");
});
