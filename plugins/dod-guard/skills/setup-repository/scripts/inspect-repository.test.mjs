import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { assessGitHubSnapshot, inspectRepository, summarizeRepository } from "./inspect-repository.mjs";
import {
  PUBLIC_VISIBILITY,
  assertPublicRepositoryReadback,
  buildPublicRepositoryPayload,
  createPublicRepository,
} from "./repository-visibility.mjs";

const execFileAsync = promisify(execFile);
const inspectorPath = fileURLToPath(new URL("./inspect-repository.mjs", import.meta.url));
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
const HTTP_FORBIDDEN = 403;

function visibilityRepository({ visibility = PUBLIC_VISIBILITY, isPrivate = false } = {}) {
  return {
    "full_name": "owner/target",
    name: "target",
    private: isPrivate,
    visibility,
  };
}

async function fixture(t, name) {
  const root = await mkdtemp(path.join(tmpdir(), `setup-repository-${name}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function git(root, ...args) {
  await execFileAsync("git", ["-C", root, ...args], { windowsHide: true });
}

async function runInspector(...args) {
  return execFileAsync(process.execPath, [inspectorPath, ...args], { windowsHide: true });
}

async function assertInspectorUsage(args, expected) {
  await assert.rejects(runInspector(...args), (error) => {
    assert.match(error.stderr, expected);
    return true;
  });
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

test("excludes generated, fixture, archive, dependency, and snapshot paths from maintained-language signals", async (t) => {
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

test("projects a bounded summary without inventory arrays or credential values", async (t) => {
  const root = await fixture(t, "summary");
  const token = ["github", "_pat_", "abcdefghijklmnopqrstuvwxyz123456"].join("");
  await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await writeFile(path.join(root, ".env"), "TOKEN=secret\n");
  await writeFile(path.join(root, "config.txt"), `${token}\n`);
  await writeFile(path.join(root, "index.ts"), "export const answer = 42;\n");
  await writeFile(path.join(root, "main.zig"), "pub fn main() void {}\n");
  await writeFile(path.join(root, "package.json"), "{}\n");
  await writeFile(path.join(root, ".github", "workflows", "ci.yml"), "name: test\n");

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

test("summary CLI stays bounded while the default and snapshot modes remain detailed", async (t) => {
  const root = await fixture(t, "cli");
  await writeFile(path.join(root, "index.ts"), "export const answer = 42;\n");
  await writeFile(path.join(root, ".env"), "TOKEN=secret\n");
  const token = ["github", "_pat_", "abcdefghijklmnopqrstuvwxyz123456"].join("");
  await writeFile(path.join(root, "config.txt"), `${token}\n`);

  const summaryOutput = await runInspector("--summary", root);
  const summary = JSON.parse(summaryOutput.stdout);
  assert.deepEqual(summary.counts, {
    files: 3,
    manifests: 0,
    configurations: 0,
    instructions: 0,
    sourceExtensions: 2,
    languages: 1,
    unclassifiedExtensions: 0,
    credentialFindings: 2,
  });
  assert.ok(summaryOutput.stdout.length < 500);
  assert.doesNotMatch(summaryOutput.stdout, new RegExp(token));
  assert.equal("files" in summary, false);
  assert.equal("credentialFindings" in summary, false);

  const full = JSON.parse((await runInspector(root)).stdout);
  assert.deepEqual(full.files, [".env", "config.txt", "index.ts"]);
  assert.deepEqual(full.credentialFindings, [
    { file: ".env", line: null, signal: "secret-like-filename" },
    { file: "config.txt", line: 1, signal: "github-token" },
  ]);

  const snapshotPath = path.join(root, "snapshot.json");
  await writeFile(snapshotPath, JSON.stringify({
    projects: [{ closed: false, statusOptions: ["Backlog", "Todo", "In Progress", "Done"] }],
    checks: [{ name: "test", conclusion: "SUCCESS" }],
  }));
  const snapshot = JSON.parse((await runInspector("--github-snapshot", snapshotPath)).stdout);
  assert.equal(snapshot.readyForProtection, true);
  assert.deepEqual(snapshot.requiredChecks, ["test"]);
});

test("keeps summary output bounded as the inventory grows", async (t) => {
  const root = await fixture(t, "summary-bound");
  await Promise.all(Array.from({ length: 400 }, (_, index) =>
    writeFile(path.join(root, `file-${index}.ts`), "export {}\n")));

  const output = await runInspector("--summary", root);
  const summary = JSON.parse(output.stdout);

  assert.equal(summary.counts.files, 400);
  assert.ok(output.stdout.length < 500);
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

test("rejects malformed summary arguments", async () => {
  await assertInspectorUsage(["--summary"], /Usage: inspect-repository\.mjs --summary <project-root>/);
  await assertInspectorUsage(["--summary", "one", "two"], /Usage: inspect-repository\.mjs --summary <project-root>/);
  await assertInspectorUsage(["project", "--summary"], /Usage: inspect-repository\.mjs \[project-root\]/);
});

test("rejects malformed GitHub snapshot arguments", async () => {
  const usage = /Usage: inspect-repository\.mjs --github-snapshot <snapshot\.json>/;

  await assertInspectorUsage(["--github-snapshot"], usage);
  await assertInspectorUsage(["--github-snapshot", "snapshot.json", "extra"], usage);
  await assertInspectorUsage(["snapshot.json", "--github-snapshot"], usage);
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

test("documents bounded routine inspection and full evidence boundaries", async () => {
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /inspect-repository\.mjs --summary <project-root>/);
  assert.match(skill, /inspect-repository\.mjs <project-root>/);
  assert.match(skill, /Full mode remains required for `credentialFindings`, staged-file review/);
  assert.match(skill, /Summary mode is not a\s+substitute for this per-file credential evidence/);
});

test("documents advisory quality diagnostics separately from correctness gates", async () => {
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /applicable correctness gates/);
  assert.match(skill, /persisted quality state/);
  assert.match(skill, /diagnostic output remains visible/);
  assert.doesNotMatch(skill, /ratchet baselines?/i);
});

test("documents the public target creation and visibility readback boundary", async () => {
  const [skill, usage, readme] = await Promise.all([
    readFile(skillPath, "utf8"),
    readFile(new URL("../../../USAGE.md", import.meta.url), "utf8"),
    readFile(new URL("../../../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(skill, /`private: false` explicitly/);
  assert.match(skill, /existing private repository public/);
  assert.match(skill, /`private: false`/);
  assert.match(skill, /`visibility: "public"`/);
  assert.match(skill, /repository-visibility\.mjs[\s\S]+reads before creation[\s\S]+reads back after the mutation/);
  assert.match(skill, /Do not add `origin`, push, link a Project,[\s\S]+enable security, or protect a branch/);
  assert.match(usage, /explicit `private: false` payload/);
  assert.match(readme, /creates a new target as\s+an explicitly public repository/);
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

test("turns malformed GitHub snapshots into a safe protection stop", () => {
  const assessment = assessGitHubSnapshot({
    projects: [{ closed: undefined, statusOptions: "Done" }],
    checks: [{ name: "build-test", conclusion: "SUCCESS" }, null],
  });

  assert.equal(assessment.readyForProtection, false);
  assert.ok(assessment.blockers.includes("expected exactly one open linked Project, found 0"));
  assert.ok(assessment.blockers.includes("check result is missing or malformed"));
  assert.ok(assessment.blockers.includes("required check names are missing or duplicated"));
  assert.equal(assessment.protectionPayload, null);
  assert.deepEqual(assessGitHubSnapshot(null), {
    readyForProtection: false,
    blockers: ["GitHub snapshot must be an object"],
    requiredChecks: [],
    protectionPayload: null,
  });
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

test("builds an explicit public create payload without initializing remote content", () => {
  assert.deepEqual(buildPublicRepositoryPayload({
    name: "target",
    organization: "owner",
    description: "fixture",
  }), {
    name: "target",
    organization: "owner",
    description: "fixture",
    private: false,
    autoInit: false,
  });
});

test("creates only an absent target and verifies public visibility after the mutation", async () => {
  const calls = [];
  let observed = null;
  const ledger = [];
  const result = await createPublicRepository({
    owner: "owner",
    name: "target",
    organization: "owner",
    readRepository: () => {
      calls.push("read");
      return observed;
    },
    createRepository: (payload) => {
      calls.push(["create", payload]);
      observed = visibilityRepository();
    },
    mutationLedger: ledger,
  });

  assert.deepEqual(calls, [
    "read",
    ["create", { name: "target", organization: "owner", private: false, autoInit: false }],
    "read",
  ]);
  assert.equal(result.repository.visibility, PUBLIC_VISIBILITY);
  assert.equal(result.repository.private, false);
  assert.deepEqual(ledger, [{
    operation: "create_repository",
    target: "owner/target",
    requestedVisibility: PUBLIC_VISIBILITY,
    status: "verified",
  }]);
});

test("refuses to mutate an existing private repository", async () => {
  let createCalls = 0;
  const ledger = [];

  await assert.rejects(
    createPublicRepository({
      owner: "owner",
      name: "target",
      readRepository: () => visibilityRepository({ visibility: "private", isPrivate: true }),
      createRepository: () => { createCalls += 1; },
      mutationLedger: ledger,
    }),
    (error) => error.name === "RepositoryVisibilityStopError" &&
      error.details.stage === "pre-create read" &&
      error.details.mutationAttempted === false,
  );
  assert.equal(createCalls, 0);
  assert.deepEqual(ledger, []);
});

test("fails closed when creation readback is missing", async () => {
  const ledger = [];
  await assert.rejects(
    createPublicRepository({
      owner: "owner",
      name: "target",
      readRepository: () => null,
      createRepository: () => undefined,
      mutationLedger: ledger,
    }),
    (error) => error.name === "RepositoryVisibilityStopError" &&
      error.details.stage === "post-create readback" &&
      error.details.mutationAttempted === true,
  );
  assert.equal(ledger[0].status, "attempted");
});

test("does not expose provider error text in failure diagnostics", async () => {
  const providerError = Object.assign(new Error("token=secret-value"), {
    status: HTTP_FORBIDDEN,
    category: "permission",
  });
  let observedError;

  await assert.rejects(
    createPublicRepository({
      owner: "owner",
      name: "target",
      readRepository: () => null,
      createRepository: () => { throw providerError; },
    }),
    (error) => {
      observedError = error;
      return error.details.provider.status === HTTP_FORBIDDEN &&
        error.details.provider.category === "permission" &&
        error.cause === undefined &&
        !Object.hasOwn(error, "cause") &&
        !JSON.stringify(error, Object.getOwnPropertyNames(error)).includes("secret-value");
    },
  );
  assert.equal(observedError.cause, undefined);
});

test("accepts case-insensitive GitHub identity in the public readback", () => {
  const repository = visibilityRepository();
  repository.full_name = "OWNER/TARGET";
  assert.equal(assertPublicRepositoryReadback(repository, { owner: "owner", name: "target" }), repository);
});

test("rejects a create destination that differs from the resolved owner", async () => {
  const ledger = [];
  let readCalls = 0;
  let createCalls = 0;

  await assert.rejects(
    createPublicRepository({
      owner: "owner",
      name: "target",
      organization: "other-owner",
      readRepository: () => {
        readCalls += 1;
        return null;
      },
      createRepository: () => {
        createCalls += 1;
      },
      mutationLedger: ledger,
    }),
    (error) => error.name === "RepositoryVisibilityStopError" &&
      error.details.stage === "destination validation" &&
      error.details.mutationAttempted === false,
  );

  assert.equal(readCalls, 0);
  assert.equal(createCalls, 0);
  assert.deepEqual(ledger, []);
});

test("rejects a contradictory repository readback", () => {
  assert.throws(
    () => assertPublicRepositoryReadback(visibilityRepository({ visibility: "private", isPrivate: true }), {
      owner: "owner",
      name: "target",
    }),
    (error) => error.name === "RepositoryVisibilityStopError" &&
      error.details.stage === "repository readback",
  );
});
