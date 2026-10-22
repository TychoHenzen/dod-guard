import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { fixture, SAMPLE_GITHUB_TOKEN } from "./fixtures/inspector-fixtures.mjs";
import { inspectRepository, summarizeRepository } from "./inspect-repository.mjs";

const execFileAsync = promisify(execFile);

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
  assert.ok(report.git.remotes.every((remote) => remote.url === "https://github.com/example/existing.git"));
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
  assert.deepEqual(report.configurations, [".github/workflows/ci.yml", ".gitignore", "biome.json"]);
});

test("reports unclassified source extensions so unsupported checks need an explicit reason", async (t) => {
  const root = await fixture(t, "unsupported");
  await writeFile(path.join(root, "main.zig"), "pub fn main() void {}\n");

  const report = await inspectRepository(root);

  assert.equal(report.sourceExtensions[".zig"], 1);
  assert.deepEqual(report.manifests, []);
  assert.deepEqual(report.unclassifiedSourceExtensions, [".zig"]);
});

test("excludes generated, fixture, archive, dependency, and snapshot paths from language signals", async (t) => {
  const root = await fixture(t, "non-maintained-paths");
  await mkdir(path.join(root, "generated"), { recursive: true });
  await mkdir(path.join(root, "Fixtures"), { recursive: true });
  await mkdir(path.join(root, "archive"), { recursive: true });
  await mkdir(path.join(root, "dependencies"), { recursive: true });
  await mkdir(path.join(root, "test-fixtures"), { recursive: true });
  await mkdir(path.join(root, "snapshots"), { recursive: true });
  await writeFile(path.join(root, "maintained.ts"), "export const answer = 42;\n");
  await writeFile(path.join(root, "generated", "generated.ts"), "export const generated = true;\n");
  await writeFile(path.join(root, "Fixtures", "fixture.ts"), "export const fixture = true;\n");
  await writeFile(path.join(root, "archive", "archived.ts"), "export const archived = true;\n");
  await writeFile(path.join(root, "dependencies", "dependency.ts"), "export const dependency = true;\n");
  await writeFile(path.join(root, "test-fixtures", "test-fixture.ts"), "export const fixture = true;\n");
  await writeFile(path.join(root, "snapshots", "snapshot.ts"), "export const snapshot = true;\n");

  const report = await inspectRepository(root);

  assert.deepEqual(report.sourceExtensions, { ".ts": 1 });
  assert.deepEqual(report.languageSignals, { "JavaScript/TypeScript": ["maintained.ts"] });
  assert.deepEqual(report.unclassifiedSourceExtensions, []);
});

async function seedSummaryProject(root) {
  await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await writeFile(path.join(root, ".env"), "TOKEN=secret\n");
  await writeFile(path.join(root, "config.txt"), `${SAMPLE_GITHUB_TOKEN}\n`);
  await writeFile(path.join(root, "index.ts"), "export const answer = 42;\n");
  await writeFile(path.join(root, "main.zig"), "pub fn main() void {}\n");
  await writeFile(path.join(root, "package.json"), "{}\n");
  await writeFile(path.join(root, ".github", "workflows", "ci.yml"), "name: test\n");
}

test("projects a bounded summary without inventory arrays or credential values", async (t) => {
  const root = await fixture(t, "summary");
  await seedSummaryProject(root);
  const token = SAMPLE_GITHUB_TOKEN;

  const summary = summarizeRepository(await inspectRepository(root));

  assert.deepEqual(summary, {
    root,
    git: { repository: false, hasCommits: false, branch: null, remotes: 0 },
    counts: {
      files: 6,
      manifests: 1,
      configurations: 1,
      instructions: 0,
      sourceExtensions: 5,
      languages: 1,
      unclassifiedExtensions: 1,
      credentialFindings: 2,
    },
  });
  assert.doesNotMatch(JSON.stringify(summary), new RegExp(token));
  assert.equal("files" in summary, false);
  assert.equal("credentialFindings" in summary, false);
});

test("rejects malformed roots without echoing the supplied path", async (t) => {
  const root = await fixture(t, "malformed-root");
  const missing = path.join(root, "missing-secret-token");

  await assert.rejects(inspectRepository(missing), (error) => {
    assert.equal(error.message, "Project root is not a directory");
    assert.doesNotMatch(error.message, /missing-secret-token/);
    return true;
  });
  await assert.rejects(inspectRepository(undefined), /Project root must be a non-empty path/);
});

test("rejects a project root that is a file without echoing it", async (t) => {
  const root = await fixture(t, "file-root");
  const file = path.join(root, "not-a-directory.txt");
  await writeFile(file, "x\n");

  await assert.rejects(inspectRepository(file), (error) => {
    assert.equal(error.message, "Project root is not a directory");
    return true;
  });
});

test("keeps a remote line the parser cannot split as a raw entry", async (t) => {
  const root = await fixture(t, "raw-remote");
  await git(root, "init", "-b", "main");
  await git(root, "remote", "add", "origin", "https://example.invalid/a b");

  const report = await inspectRepository(root);

  assert.equal(report.git.remotes.length, 2);
  for (const remote of report.git.remotes) {
    assert.deepEqual(Object.keys(remote), ["raw"]);
    assert.match(remote.raw, /^origin\s+https:\/\/example\.invalid\/a b \((fetch|push)\)$/);
  }
});
