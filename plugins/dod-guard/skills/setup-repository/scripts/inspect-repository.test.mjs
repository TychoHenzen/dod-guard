import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { assessGitHubSnapshot, inspectRepository } from "./inspect-repository.mjs";

const execFileAsync = promisify(execFile);
const workflowLabelsPath = new URL("./workflow-labels.json", import.meta.url);
const skillPath = new URL("../SKILL.md", import.meta.url);
const EXPECTED_WORKFLOW_LABELS = [
  ["Prio 1 - Emergency", "Critical/Urgent issue, requires immediate action.", "b60205"],
  ["Prio 2 - Urgent", "Serious issues or important milestones that heavily impact progress", "fbca04"],
  ["Prio 3 - Standard", "Moderate tasks or minor issues not halting overall progress.", "0e8a16"],
  ["Prio 4 - Non-Urgent", "Minor inconveniences, cosmetic fixes, or standard requests", "006b75"],
  ["Prio 5 - Planned", "Proactive improvements, exploratory tasks, or routine updates", "1d76db"],
  ["Prio 6 - Unknown", "priority can not be assessed at this point, requires re-evaluation later", "FF00FF"],
  ["Effort 1 - Trivial", "Tiny task. Extremely clear, zero risk, takes minutes to a couple of hours.", "1d76db"],
  ["Effort 2 - Easy", "Simple task. Well-understood with minimal effort or risk", "006b75"],
  ["Effort 3 - Medium", "Average task. About a day of work with minor unknowns.", "0e8a16"],
  ["Effort 5 - Large", "Complex task. Requires significant effort or has notable dependencies.", "fbca04"],
  ["Effort 8 - Huge", "Very complex. Hard to estimate accurately; often needs to be broken down.", "d93f0b"],
  ["Effort 13 - Epic", "Too big to implement. Must be split into smaller issues before development.", "b60205"],
  ["bug", "Something isn't working", "d73a4a"],
  ["documentation", "Improvements or additions to documentation", "0075ca"],
  ["duplicate", "This issue or pull request already exists", "cfd3d7"],
  ["enhancement", "New feature or request", "a2eeef"],
  ["good first issue", "Good for newcomers", "7057ff"],
  ["help wanted", "Extra attention is needed", "008672"],
  ["invalid", "This doesn't seem right", "e4e669"],
  ["question", "Further information is requested", "d876e3"],
  ["wontfix", "This will not be worked on", "ffffff"],
].map(([name, description, color]) => ({ name, description, color }));

async function fixture(t, name) {
  const root = await mkdtemp(path.join(tmpdir(), `setup-repository-${name}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function git(root, ...args) {
  await execFileAsync("git", ["-C", root, ...args], { windowsHide: true });
}

test("inventories a fresh project without inventing Git state", async (t) => {
  const root = await fixture(t, "fresh");
  await writeFile(path.join(root, "package.json"), '{"scripts":{"test":"node --test"}}\n');
  await writeFile(path.join(root, "index.ts"), "export const answer = 42;\n");

  const report = await inspectRepository(root);

  assert.equal(report.git.repository, false);
  assert.equal(report.git.hasCommits, false);
  assert.deepEqual(report.manifests, ["package.json"]);
  assert.equal(report.sourceExtensions[".ts"], 1);
  assert.deepEqual(report.languageSignals["JavaScript/TypeScript"], ["index.ts"]);
});

test("reports existing history and every configured remote without changing either", async (t) => {
  const root = await fixture(t, "history");
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "Fixture");
  await git(root, "config", "user.email", "fixture@example.invalid");
  await writeFile(path.join(root, "README.md"), "fixture\n");
  await git(root, "add", "README.md");
  await git(root, "commit", "-m", "initial");
  await git(root, "remote", "add", "origin", "https://github.com/example/existing.git");

  const report = await inspectRepository(root);

  assert.equal(report.git.repository, true);
  assert.equal(report.git.hasCommits, true);
  assert.equal(report.git.branch, "main");
  assert.ok(report.git.remotes.some((remote) => remote.name === "origin" && remote.direction === "fetch"));
  assert.ok(report.git.remotes.some((remote) => remote.name === "origin" && remote.direction === "push"));
});

test("keeps ignore rules, workflows, instructions, and tool configuration visible as merge inputs", async (t) => {
  const root = await fixture(t, "merge-inputs");
  await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await writeFile(path.join(root, ".gitignore"), "coverage/\n.env\n");
  await writeFile(path.join(root, "AGENTS.md"), "Keep existing guidance.\n");
  await writeFile(path.join(root, "biome.json"), '{"formatter":{"enabled":true}}\n');
  await writeFile(path.join(root, ".github", "workflows", "ci.yml"), "name: existing\n");

  const report = await inspectRepository(root);

  assert.deepEqual(report.instructions, ["AGENTS.md"]);
  assert.deepEqual(report.configurations, [
    ".github/workflows/ci.yml",
    ".gitignore",
    "biome.json",
  ]);
});

test("reports unclassified source extensions so unsupported checks need an explicit reason", async (t) => {
  const root = await fixture(t, "unsupported");
  await writeFile(path.join(root, "main.zig"), "pub fn main() void {}\n");

  const report = await inspectRepository(root);

  assert.equal(report.sourceExtensions[".zig"], 1);
  assert.deepEqual(report.manifests, []);
  assert.deepEqual(report.unclassifiedSourceExtensions, [".zig"]);
});

test("reports likely credentials without returning their values", async (t) => {
  const root = await fixture(t, "credentials");
  await writeFile(path.join(root, ".env"), "TOKEN=secret\n");
  const token = ["github", "_pat_", "abcdefghijklmnopqrstuvwxyz123456"].join("");
  await writeFile(path.join(root, "config.txt"), `${token}\n`);

  const report = await inspectRepository(root);

  assert.deepEqual(report.credentialFindings, [
    { file: ".env", line: null, signal: "secret-like-filename" },
    { file: "config.txt", line: 1, signal: "github-token" },
  ]);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(token));
});

test("ships the canonical workflow labels while preserving repository-specific labels", async () => {
  const [labels, skill] = await Promise.all([
    readFile(workflowLabelsPath, "utf8").then(JSON.parse),
    readFile(skillPath, "utf8"),
  ]);

  assert.deepEqual(labels, EXPECTED_WORKFLOW_LABELS);
  assert.match(skill, /workflow-labels\.json/);
  assert.match(skill, /Preserve\s+every label outside that exact catalog/);
  assert.match(skill, /each preserved label must be unchanged/);
});

test("blocks ambiguous linked Project state", () => {
  const assessment = assessGitHubSnapshot({
    projects: [
      { closed: false, statusOptions: ["Backlog", "Todo", "In Progress", "Done"] },
      { closed: false, statusOptions: ["Backlog", "Todo", "In Progress", "Done"] },
    ],
    checks: [{ name: "test", conclusion: "SUCCESS" }],
  });

  assert.equal(assessment.readyForProtection, false);
  assert.match(assessment.blockers[0], /exactly one open linked Project, found 2/);
  assert.equal(assessment.protectionPayload, null);
});

test("blocks protection after a failed check", () => {
  const assessment = assessGitHubSnapshot({
    projects: [{ closed: false, statusOptions: ["Backlog", "Todo", "In Progress", "Done"] }],
    checks: [{ name: "build-test", conclusion: "FAILURE" }],
  });

  assert.equal(assessment.readyForProtection, false);
  assert.ok(assessment.blockers.includes("check build-test concluded FAILURE"));
  assert.equal(assessment.protectionPayload, null);
});

test("builds strict protection from successful observed check names", () => {
  const assessment = assessGitHubSnapshot({
    projects: [{ closed: false, statusOptions: ["Backlog", "Todo", "In Progress", "Done"] }],
    checks: [
      { name: "test", conclusion: "SUCCESS" },
      { name: "lint", conclusion: "SUCCESS" },
    ],
  });

  assert.equal(assessment.readyForProtection, true);
  assert.deepEqual(assessment.requiredChecks, ["lint", "test"]);
  assert.deepEqual(assessment.protectionPayload.required_status_checks, {
    strict: true,
    contexts: ["lint", "test"],
  });
  assert.deepEqual(assessment.protectionPayload.required_pull_request_reviews, {
    required_approving_review_count: 0,
  });
  assert.equal(assessment.protectionPayload.enforce_admins, true);
  assert.equal(assessment.protectionPayload.allow_force_pushes, false);
  assert.equal(assessment.protectionPayload.allow_deletions, false);
});
