// Syncs finished local tasks of a HagiCode change folder back to the slice
// sub-issues of its parent issue, after the work is pushed. The issue is the
// source of truth: sync only ticks checklist items and closes a slice whose
// items are all ticked. It never unticks, reopens, or adds an item; a local
// task the issue does not hold is reported as unpublished.
//
//   node openspec-sync.mjs plan  --change=<dir> --issue=<n> --repository=<owner/name>
//   node openspec-sync.mjs apply --change=<dir> --issue=<n> --repository=<owner/name>
//
// `plan` writes nothing. `apply` plans again from live state, then re-reads
// each issue right before writing it. Both print one JSON object.
// Exit 0: `in-sync`, `ready` (plan), or `applied`. Exit 1: `not-pushed`, so
// nothing was or will be written until the branch is pushed. Exit 2: a bad
// argument, an unreadable change folder or checkout, or a failed GitHub call.
// biome-ignore lint/correctness/noNodejsModules: the pushed check reads the checkout with git
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: an issue body goes to gh through a temporary file
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: the temporary body file lives in the system temp directory
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: temporary paths are joined per platform
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { parseIssueBodyRecords } from "../../../lib/issue-body-records.mjs";
import { readChangeFolder } from "../../../lib/openspec-folder.mjs";
import { parseSliceBody, parseTasksFile, slicesFrom, taskKey, tickSliceItems } from "../../../lib/openspec-tasks.mjs";
import { errorMessage, ghJson, ghJsonArrayPages, runGh } from "../../complete-pr/scripts/lib/gh-runner.mjs";

const USAGE = "usage: node openspec-sync.mjs plan|apply --change=<dir> --issue=<n> --repository=<owner/name>";
const ISSUE = /^[1-9]\d*$/;
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;

function git(dir, args) {
  const result = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", windowsHide: true });
  return { ok: result.status === 0, out: (result.stdout ?? "").trim(), err: (result.stderr ?? "").trim() };
}

// ASSUMPTION: tasks.md records no commit per task, so a ticked task counts as
// completed by the commits up to HEAD. The work is pushed when the tracked
// tree is clean and HEAD is reachable from the branch's live ref on origin.
function pushState(changeDir) {
  const branch = git(changeDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = git(changeDir, ["rev-parse", "HEAD"]);
  if (!(branch.ok && head.ok)) throw new Error(`${changeDir} is not inside a git checkout with a commit`);
  const state = { branch: branch.out, head: head.out, remote: null, pushed: false, reason: null };
  if (git(changeDir, ["status", "--porcelain", "--untracked-files=no"]).out !== "") {
    return { ...state, reason: "the checkout has uncommitted tracked changes; commit and push them first" };
  }
  const listed = git(changeDir, ["ls-remote", "origin", `refs/heads/${state.branch}`]);
  if (!listed.ok) throw new Error(`git ls-remote origin failed: ${listed.err}`);
  state.remote = listed.out.split(/\s/)[0] || null;
  if (!state.remote) return { ...state, reason: `origin has no branch ${state.branch}; push it first` };
  if (!git(changeDir, ["merge-base", "--is-ancestor", state.head, state.remote]).ok) {
    return { ...state, reason: `HEAD ${state.head} is not on origin/${state.branch}; push it first` };
  }
  return { ...state, pushed: true };
}

function readIssue(repository, number, runner) {
  return ghJson(["api", `repos/${repository}/issues/${number}`], [0], runner).data;
}

function readGitHub({ repository, issue }, runner) {
  const parent = readIssue(repository, issue, runner);
  const children = ghJsonArrayPages(`repos/${repository}/issues/${issue}/sub_issues?per_page=100`, runner);
  const slices = children
    .map((child) => ({ number: child.number, state: child.state, ...parseSliceBody(child.body) }))
    .filter((child) => child.slice !== null);
  const parentTasks = parseIssueBodyRecords(parent.body ?? "").input.tasks ?? [];
  return { slices, parentKeys: new Set(parentTasks.map((task) => taskKey(task.title ?? ""))) };
}

function compareSlice(entry, subIssue, result) {
  for (const task of entry.categories.flatMap((category) => category.tasks)) {
    const item = subIssue.items.find((candidate) => taskKey(candidate.text) === taskKey(task.text));
    if (!item) {
      result.unpublished.push({ slice: entry.slice, id: task.id, text: task.text });
    } else if (task.done && !item.checked) {
      result.ticks.push({ issue: subIssue.number, slice: entry.slice, id: task.id, text: item.text });
    } else if (!task.done && item.checked) {
      result.issueOnly.push({ issue: subIssue.number, slice: entry.slice, id: task.id });
    }
  }
}

function closableSlices(slices, ticks) {
  return slices
    .filter((subIssue) => subIssue.state === "open" && subIssue.items.length > 0)
    .filter((subIssue) => {
      const ticked = new Set(ticks.filter((tick) => tick.issue === subIssue.number).map((tick) => taskKey(tick.text)));
      return subIssue.items.every((item) => item.checked || ticked.has(taskKey(item.text)));
    })
    .map((subIssue) => ({ issue: subIssue.number, slice: subIssue.slice }));
}

// A parent-held task has no checklist item to tick. It is published when the
// parent's task-list record holds a task of the same text.
function compareParentTasks(slice, groups, parentKeys, result) {
  for (const task of groups.flatMap((group) => group.tasks)) {
    if (!parentKeys.has(taskKey(task.text))) result.unpublished.push({ slice, id: task.id, text: task.text });
  }
}

function compare(local, remote) {
  const result = { ticks: [], issueOnly: [], unpublished: [] };
  for (const entry of local.slices) {
    const subIssue = remote.slices.find((candidate) => candidate.slice === entry.slice);
    // A slice whose whole work is one trivial task gets no sub-issue, so its
    // task lives in the parent's task-list record instead.
    if (subIssue) compareSlice(entry, subIssue, result);
    else compareParentTasks(entry.slice, entry.categories, remote.parentKeys, result);
  }
  compareParentTasks(null, local.parentTasks, remote.parentKeys, result);
  return { ...result, closes: closableSlices(remote.slices, result.ticks) };
}

function planSync(options, { runner = runGh } = {}) {
  const { tasks } = readChangeFolder(options.change);
  if (!tasks) throw new Error(`${options.change} has no tasks.md`);
  const found = compare(slicesFrom(parseTasksFile(tasks)), readGitHub(options, runner));
  const push = pushState(options.change);
  const pending = found.ticks.length + found.closes.length > 0;
  let status = "in-sync";
  if (pending) status = push.pushed ? "ready" : "not-pushed";
  const out = { status, branch: push.branch, head: push.head, remote: push.remote, reason: push.reason, ...found };
  return { code: status === "not-pushed" ? 1 : 0, out };
}

function writeBody(repository, number, body, runner) {
  const dir = mkdtempSync(join(tmpdir(), "openspec-sync-"));
  try {
    const file = join(dir, "body.md");
    writeFileSync(file, body);
    ghJson(["api", "--method", "PATCH", `repos/${repository}/issues/${number}`, "-F", `body=@${file}`], [0], runner);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Ticks the planned items on a fresh read of one slice sub-issue, reads it
// back, and closes it when every item reads back ticked. A sub-issue someone
// closed in the meantime is left alone, because sync never reopens.
function applyToIssue(repository, number, keys, runner) {
  const fresh = readIssue(repository, number, runner);
  if (fresh.state !== "open") return { closed: false, ticked: false };
  const body = tickSliceItems(fresh.body, keys);
  if (body !== fresh.body.replace(/\r\n/g, "\n")) writeBody(repository, number, body, runner);
  const items = parseSliceBody(readIssue(repository, number, runner).body).items;
  const missed = items.filter((item) => keys.has(taskKey(item.text)) && !item.checked);
  if (missed.length > 0)
    throw new Error(`issue #${number} did not read back ticked: ${missed.map((item) => item.text).join("; ")}`);
  if (items.length === 0 || !items.every((item) => item.checked)) return { closed: false, ticked: keys.size > 0 };
  ghJson(
    [
      "api",
      "--method",
      "PATCH",
      `repos/${repository}/issues/${number}`,
      "-f",
      "state=closed",
      "-f",
      "state_reason=completed",
    ],
    [0],
    runner,
  );
  if (readIssue(repository, number, runner).state !== "closed")
    throw new Error(`issue #${number} did not read back closed`);
  return { closed: true, ticked: keys.size > 0 };
}

function applySync(options, { runner = runGh } = {}) {
  const plan = planSync(options, { runner });
  if (plan.out.status !== "ready") return plan;
  const numbers = [...new Set([...plan.out.ticks, ...plan.out.closes].map((entry) => entry.issue))];
  const ticked = [];
  const closed = [];
  for (const number of numbers) {
    const mine = plan.out.ticks.filter((tick) => tick.issue === number);
    const result = applyToIssue(options.repository, number, new Set(mine.map((tick) => taskKey(tick.text))), runner);
    if (result.ticked) ticked.push({ issue: number, ids: mine.map((tick) => tick.id) });
    if (result.closed) closed.push(number);
  }
  return { code: 0, out: { status: "applied", ticked, closed, unpublished: plan.out.unpublished } };
}

function runCli(argv) {
  const [mode, ...rest] = argv;
  const args = parseArgs(rest);
  const valid =
    ["plan", "apply"].includes(mode) &&
    args?.change &&
    ISSUE.test(args.issue ?? "") &&
    REPOSITORY.test(args.repository ?? "") &&
    Object.keys(args).length === 3;
  if (!valid) return { code: 2, error: USAGE };
  const options = { change: args.change, issue: Number(args.issue), repository: args.repository };
  try {
    return mode === "plan" ? planSync(options) : applySync(options);
  } catch (error) {
    return { code: 2, error: errorMessage(error) };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runCli(process.argv.slice(2));
  if (result.error) process.stderr.write(`${result.error}\n`);
  if (result.out) process.stdout.write(`${JSON.stringify(result.out)}\n`);
  process.exitCode = result.code;
}

export { applySync, planSync };
