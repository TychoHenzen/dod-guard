import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { assessGitHubSnapshot, inspectRepository } from "./inspect-repository.mjs";

const execFileAsync = promisify(execFile);

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
  await writeFile(path.join(root, "config.txt"), "github_pat_abcdefghijklmnopqrstuvwxyz123456\n");

  const report = await inspectRepository(root);

  assert.deepEqual(report.credentialFindings, [
    { file: ".env", line: null, signal: "secret-like-filename" },
    { file: "config.txt", line: 1, signal: "github-token" },
  ]);
  assert.doesNotMatch(JSON.stringify(report), /github_pat_abcdefghijklmnopqrstuvwxyz123456/);
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
  assert.equal(assessment.protectionPayload.enforce_admins, true);
  assert.equal(assessment.protectionPayload.allow_force_pushes, false);
  assert.equal(assessment.protectionPayload.allow_deletions, false);
});
