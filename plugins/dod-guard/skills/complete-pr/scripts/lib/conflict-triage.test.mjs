// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: The fixtures drive a real Git CLI.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: The fixtures write temporary repositories.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: The fixtures write temporary repositories.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: The fixtures write temporary repositories.
import { dirname, join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  abortOwnMerge,
  assertAllowedGitCommand,
  checkRegeneration,
  commitMerge,
  createGitRunner,
  pushMerge,
  renderTriageRecord,
  startTriage,
  TRIAGE_GIT_SUBCOMMANDS,
  TriageStop,
  verifyResolution,
} from "./conflict-triage.mjs";

const REPOSITORY = "owner/repo";
const BRANCH = "codex/1-triage";

// Fixture commands run outside the module under test, so they use a plain
// runner that the triage allowlist does not restrict.
function sh(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function writeFiles(work, files) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(work, path);
    if (content === null) {
      rmSync(target);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }
}

function commit(work, files, message) {
  writeFiles(work, files);
  sh(work, ["add", "-A"]);
  sh(work, ["commit", "-q", "-m", message]);
  return sh(work, ["rev-parse", "HEAD"]);
}

// Builds a bare origin and a clone whose PBI branch and master both changed the
// given paths since their common base. The clone ends on the PBI branch.
function createScenario({ base, branch, master }) {
  const root = mkdtempSync(join(tmpdir(), "conflict-triage-"));
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  sh(root, ["init", "-q", "--bare", "-b", "master", origin]);
  sh(root, ["init", "-q", "-b", "master", work]);
  for (const [key, value] of [
    ["user.name", "Triage Test"],
    ["user.email", "triage@example.invalid"],
    ["core.autocrlf", "false"],
    ["core.longpaths", "true"],
    ["commit.gpgsign", "false"],
  ]) {
    sh(work, ["config", key, value]);
  }
  sh(work, ["remote", "add", "origin", origin]);
  commit(work, base, "base");
  sh(work, ["push", "-q", "origin", "master"]);
  sh(work, ["switch", "-q", "-c", BRANCH]);
  const trustedHead = commit(work, branch, "branch change");
  sh(work, ["push", "-q", "origin", BRANCH]);
  sh(work, ["switch", "-q", "master"]);
  const baseSha = commit(work, master, "master change");
  sh(work, ["push", "-q", "origin", "master"]);
  sh(work, ["switch", "-q", BRANCH]);
  const pullRequest = {
    baseBranch: "master",
    baseSha,
    headBranch: BRANCH,
    headRepository: REPOSITORY,
    headSha: trustedHead,
    state: "OPEN",
  };
  return {
    baseSha,
    cleanup: () => rmSync(root, { force: true, recursive: true }),
    git: createGitRunner(work),
    input: { defaultBranch: "master", pullRequest, repository: REPOSITORY, trustedHead },
    origin,
    pullRequest,
    trustedHead,
    work,
  };
}

function textScenario() {
  return createScenario({
    base: { "src/value.txt": "one\n", "test/value.test.js": "expect(1);\n" },
    branch: { "src/value.txt": "branch\n", "test/value.test.js": "expect(2);\n" },
    master: { "src/value.txt": "master\n", "test/value.test.js": "expect(3);\n" },
  });
}

function originHead(scenario) {
  return sh(scenario.origin, ["rev-parse", `refs/heads/${BRANCH}`]);
}

function mergeHead(scenario) {
  return spawnSync("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { cwd: scenario.work, encoding: "utf8" })
    .stdout.trim();
}

function stopOf(action) {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof TriageStop, error.message);
    return error;
  }
  assert.fail("expected a TriageStop");
}

async function asyncStopOf(action) {
  try {
    await action();
  } catch (error) {
    assert.ok(error instanceof TriageStop, error.message);
    return error;
  }
  assert.fail("expected a TriageStop");
}

const COMBINED = [
  { basis: "AC-1 keeps both values", decision: "combine", path: "src/value.txt", questionIds: ["Q1"] },
  { basis: "master's test pins the new contract", decision: "take-base", path: "test/value.test.js", questionIds: [] },
];

function resolveCombined(scenario) {
  writeFiles(scenario.work, { "src/value.txt": "branch\nmaster\n", "test/value.test.js": "expect(3);\n" });
  sh(scenario.work, ["add", "src/value.txt", "test/value.test.js"]);
}

test("merges the recorded base and pushes a judged conflict as one two-parent commit", async () => {
  const scenario = textScenario();
  try {
    const started = startTriage(scenario.git, scenario.input);
    assert.equal(started.recordedBase, scenario.baseSha);
    assert.deepEqual(started.conflicts, [
      { class: "source", code: "UU", path: "src/value.txt" },
      { class: "test", code: "UU", path: "test/value.test.js" },
    ]);
    resolveCombined(scenario);
    const state = { ...started, decisions: COMBINED };
    assert.deepEqual(verifyResolution(scenario.git, state), { ok: true, problems: [] });
    const mergeSha = commitMerge(scenario.git, { ...state, message: "Merge master into the PBI branch" });
    assert.deepEqual(verifyResolution(scenario.git, state), { ok: true, problems: [] });
    const pushed = await pushMerge(scenario.git, { ...state, branch: BRANCH, readPullRequest: () => scenario.pullRequest });
    assert.equal(pushed.mergeSha, mergeSha);
    assert.equal(pushed.remoteHead, mergeSha);
    assert.equal(originHead(scenario), mergeSha);
    assert.equal(
      sh(scenario.work, ["rev-list", "--parents", "-n", "1", mergeSha]),
      `${mergeSha} ${scenario.trustedHead} ${scenario.baseSha}`,
    );
  } finally {
    scenario.cleanup();
  }
});

test("stops on a binary conflict and aborts only its own merge", () => {
  const scenario = createScenario({
    base: { "assets/icon.bin": "a\0base" },
    branch: { "assets/icon.bin": "a\0branch" },
    master: { "assets/icon.bin": "a\0master" },
  });
  try {
    const stop = stopOf(() => startTriage(scenario.git, scenario.input));
    assert.equal(stop.code, "unresolvable_paths");
    assert.deepEqual(stop.details.paths, ["assets/icon.bin (binary)"]);
    assert.equal(stop.details.merge, "aborted");
    assert.match(stop.details.decisionNeeded, /by hand/);
    assert.equal(mergeHead(scenario), "");
    assert.equal(sh(scenario.work, ["rev-parse", "HEAD"]), scenario.trustedHead);
    assert.equal(originHead(scenario), scenario.trustedHead);
  } finally {
    scenario.cleanup();
  }
});

test("stops on a path modified on one side and deleted on the other", () => {
  const scenario = createScenario({
    base: { "src/gone.txt": "one\n" },
    branch: { "src/gone.txt": null },
    master: { "src/gone.txt": "two\n" },
  });
  try {
    const stop = stopOf(() => startTriage(scenario.git, scenario.input));
    assert.deepEqual(stop.details.paths, ["src/gone.txt (modify-delete)"]);
    assert.equal(stop.details.merge, "aborted");
    assert.equal(originHead(scenario), scenario.trustedHead);
  } finally {
    scenario.cleanup();
  }
});

test("classifies a declared generated path and stops on an undeclared one", () => {
  const files = (side) => ({ "dist/out.js": `// @generated\nconsole.log("${side}");\n` });
  const declared = createScenario({ base: files("base"), branch: files("branch"), master: files("master") });
  try {
    const generators = [{ command: "node build.mjs", paths: ["dist/*.js"] }];
    const started = startTriage(declared.git, { ...declared.input, generators });
    assert.deepEqual(started.conflicts, [{ class: "generated", code: "UU", path: "dist/out.js" }]);
  } finally {
    declared.cleanup();
  }
  const undeclared = createScenario({ base: files("base"), branch: files("branch"), master: files("master") });
  try {
    const stop = stopOf(() => startTriage(undeclared.git, undeclared.input));
    assert.deepEqual(stop.details.paths, ["dist/out.js (undeclared-generated)"]);
    assert.equal(stop.details.merge, "aborted");
  } finally {
    undeclared.cleanup();
  }
});

test("regenerates a declared generated path and accepts only its declared outputs", () => {
  const files = (side) => ({ "dist/out.js": `// @generated\nconsole.log("${side}");\n`, "src/value.txt": `${side}\n` });
  const scenario = createScenario({ base: files("base"), branch: files("branch"), master: files("master") });
  const generators = [{ command: "node build.mjs", paths: ["dist/*.js"] }];
  const rebuilt = '// @generated\nconsole.log("branch master");\n';
  try {
    const started = startTriage(scenario.git, { ...scenario.input, generators });
    assert.deepEqual(
      started.conflicts.map((conflict) => conflict.class),
      ["generated", "source"],
    );
    writeFiles(scenario.work, { "src/value.txt": "branch\nmaster\n" });
    sh(scenario.work, ["add", "src/value.txt"]);
    // The declared generator rewrites its output from the resolved sources.
    writeFiles(scenario.work, { "dist/out.js": rebuilt });
    assert.deepEqual(checkRegeneration(scenario.git, { generators }), {
      generatedPaths: ["dist/out.js"],
      ok: true,
      problems: [],
    });
    sh(scenario.work, ["add", "dist/out.js"]);
    assert.deepEqual(checkRegeneration(scenario.git, { expectClean: true, generators }), {
      generatedPaths: [],
      ok: true,
      problems: [],
    });

    writeFiles(scenario.work, { "src/stray.txt": "stray\n" });
    assert.deepEqual(checkRegeneration(scenario.git, { generators }).problems, [
      { path: "src/stray.txt", problem: "the generator changed a path it does not declare" },
    ]);
    rmSync(join(scenario.work, "src/stray.txt"));
    writeFiles(scenario.work, { "dist/out.js": `${rebuilt}// again\n` });
    assert.deepEqual(checkRegeneration(scenario.git, { expectClean: true, generators }).problems, [
      { path: "dist/out.js", problem: "the generator changed this path again (drift)" },
    ]);
    writeFiles(scenario.work, { "dist/out.js": rebuilt });

    const decisions = [
      { basis: "the declared generator rebuilt it", decision: "regenerate", path: "dist/out.js" },
      { basis: "AC-1 keeps both values", decision: "combine", path: "src/value.txt" },
    ];
    const misjudged = [decisions[0], { ...decisions[1], decision: "regenerate" }];
    assert.deepEqual(verifyResolution(scenario.git, { ...started, decisions: misjudged, generators }).problems, [
      { path: "src/value.txt", problem: "decision regenerate is not visible in the resolution" },
    ]);
    assert.deepEqual(verifyResolution(scenario.git, { ...started, decisions, generators }), { ok: true, problems: [] });
    const mergeSha = commitMerge(scenario.git, { ...started, message: "merge" });
    assert.equal(
      sh(scenario.work, ["rev-list", "--parents", "-n", "1", mergeSha]),
      `${mergeSha} ${scenario.trustedHead} ${scenario.baseSha}`,
    );
    assert.equal(`${sh(scenario.work, ["show", `${mergeSha}:dist/out.js`])}\n`, rebuilt);
  } finally {
    scenario.cleanup();
  }
});

test("checks every precondition before any write", () => {
  const scenario = textScenario();
  try {
    const cases = [
      ["pull_request_not_open", { pullRequest: { ...scenario.pullRequest, state: "CLOSED" } }],
      ["fork_head", { pullRequest: { ...scenario.pullRequest, headRepository: "fork/repo" } }],
      ["base_not_default", { pullRequest: { ...scenario.pullRequest, baseBranch: "release" } }],
      ["trusted_head_invalid", { trustedHead: "abc" }],
      ["head_moved", { pullRequest: { ...scenario.pullRequest, headSha: scenario.baseSha } }],
      ["base_not_local", { pullRequest: { ...scenario.pullRequest, baseSha: "f".repeat(40) } }],
      ["wrong_branch", { pullRequest: { ...scenario.pullRequest, headBranch: "codex/2-other" } }],
    ];
    for (const [code, override] of cases) {
      const stop = stopOf(() => startTriage(scenario.git, { ...scenario.input, ...override }));
      assert.equal(stop.code, code);
    }
    writeFiles(scenario.work, { "notes.txt": "pending\n" });
    assert.equal(stopOf(() => startTriage(scenario.git, scenario.input)).code, "worktree_dirty");
    rmSync(join(scenario.work, "notes.txt"));
    const invalid = { ...scenario.input, generators: [{ command: "", paths: [] }] };
    assert.equal(stopOf(() => startTriage(scenario.git, invalid)).code, "generators_invalid");
    assert.equal(mergeHead(scenario), "");
    assert.equal(sh(scenario.work, ["status", "--porcelain"]), "");
  } finally {
    scenario.cleanup();
  }
});

test("reports markers, whitespace, unstaged edits, and decisions the resolution does not show", () => {
  const scenario = textScenario();
  try {
    const started = startTriage(scenario.git, scenario.input);
    const unbased = stopOf(() =>
      verifyResolution(scenario.git, { ...started, decisions: [{ ...COMBINED[0], basis: " " }, COMBINED[1]] }),
    );
    assert.equal(unbased.code, "decision_without_basis");
    assert.deepEqual(unbased.details.paths, ["src/value.txt"]);
    const judgedStop = stopOf(() =>
      verifyResolution(scenario.git, { ...started, decisions: [{ ...COMBINED[0], decision: "stop" }, COMBINED[1]] }),
    );
    assert.equal(judgedStop.code, "decision_without_basis");

    writeFiles(scenario.work, { "src/value.txt": "<<<<<<< HEAD\nbranch \n=======\nmaster\n>>>>>>> base\n" });
    sh(scenario.work, ["add", "src/value.txt"]);
    writeFiles(scenario.work, { "test/value.test.js": "expect(3);\n" });
    const decisions = [{ ...COMBINED[0] }, { ...COMBINED[1], decision: "take-branch" }];
    const result = verifyResolution(scenario.git, { ...started, decisions });
    const problems = result.problems.map((entry) => `${entry.path}: ${entry.problem.split("\n")[0]}`);
    assert.equal(result.ok, false);
    assert.ok(problems.includes("test/value.test.js: still unmerged"), problems.join("; "));
    assert.ok(problems.includes("src/value.txt: conflict markers remain"), problems.join("; "));
    assert.ok(problems.some((entry) => entry.startsWith("null: git diff --check")), problems.join("; "));
    assert.ok(problems.includes("test/value.test.js: decision take-branch is not visible in the resolution"));
  } finally {
    scenario.cleanup();
  }
});

test("pushes nothing when the base moves during the run", async () => {
  const scenario = textScenario();
  try {
    const started = startTriage(scenario.git, scenario.input);
    resolveCombined(scenario);
    commitMerge(scenario.git, { ...started, message: "merge" });
    const moved = { ...scenario.pullRequest, baseSha: "e".repeat(40) };
    const stop = await asyncStopOf(() =>
      pushMerge(scenario.git, { ...started, branch: BRANCH, readPullRequest: () => moved }),
    );
    assert.equal(stop.code, "base_moved");
    assert.equal(stop.details.expected, scenario.baseSha);
    assert.equal(originHead(scenario), scenario.trustedHead);
    const headMoved = { ...scenario.pullRequest, headSha: scenario.baseSha };
    const headStop = await asyncStopOf(() =>
      pushMerge(scenario.git, { ...started, branch: BRANCH, readPullRequest: () => headMoved }),
    );
    assert.equal(headStop.code, "head_moved");
  } finally {
    scenario.cleanup();
  }
});

test("stops without retrying when the remote refuses a non-fast-forward push", async () => {
  const scenario = textScenario();
  try {
    const started = startTriage(scenario.git, scenario.input);
    resolveCombined(scenario);
    commitMerge(scenario.git, { ...started, message: "merge" });
    const race = sh(scenario.work, ["commit-tree", `${scenario.trustedHead}^{tree}`, "-p", scenario.trustedHead, "-m", "race"]);
    sh(scenario.work, ["push", "-q", "origin", `${race}:refs/heads/${BRANCH}`]);
    const pushes = [];
    const recording = (args, codes) => {
      if (args[0] === "push") {
        pushes.push(args);
      }
      return scenario.git(args, codes);
    };
    const stop = await asyncStopOf(() =>
      pushMerge(recording, { ...started, branch: BRANCH, readPullRequest: () => scenario.pullRequest }),
    );
    assert.equal(stop.code, "push_rejected");
    assert.equal(pushes.length, 1);
    assert.equal(originHead(scenario), race);
  } finally {
    scenario.cleanup();
  }
});

test("refuses a commit whose parents are not the trusted head and the recorded base", async () => {
  const scenario = textScenario();
  try {
    const started = startTriage(scenario.git, scenario.input);
    abortOwnMerge(scenario.git, started.recordedBase);
    commit(scenario.work, { "src/value.txt": "branch\nmaster\n" }, "not a merge");
    const stop = await asyncStopOf(() =>
      pushMerge(scenario.git, { ...started, branch: BRANCH, readPullRequest: () => scenario.pullRequest }),
    );
    assert.equal(stop.code, "provenance_mismatch");
    assert.equal(originHead(scenario), scenario.trustedHead);
  } finally {
    scenario.cleanup();
  }
});

test("aborts only a merge of the recorded base", () => {
  const scenario = textScenario();
  try {
    assert.equal(abortOwnMerge(scenario.git, scenario.baseSha), "none");
    const other = sh(scenario.work, ["commit-tree", `${scenario.baseSha}^{tree}`, "-p", scenario.baseSha, "-m", "other"]);
    spawnSync("git", ["merge", "--no-ff", "--no-commit", other], { cwd: scenario.work });
    assert.equal(abortOwnMerge(scenario.git, scenario.baseSha), "not-owned");
    assert.equal(mergeHead(scenario), other);
  } finally {
    scenario.cleanup();
  }
});

test("runs only allowlisted git commands and refuses destructive ones", async () => {
  const scenario = textScenario();
  const used = new Set();
  const recording = (args, codes) => {
    used.add(args[0]);
    return scenario.git(args, codes);
  };
  try {
    const started = startTriage(recording, scenario.input);
    resolveCombined(scenario);
    const state = { ...started, decisions: COMBINED };
    verifyResolution(recording, state);
    commitMerge(recording, { ...state, message: "merge" });
    commitMerge(recording, { ...state, amend: true });
    await pushMerge(recording, { ...state, branch: BRANCH, readPullRequest: () => scenario.pullRequest });
  } finally {
    scenario.cleanup();
  }
  assert.deepEqual([...used].sort(), [...TRIAGE_GIT_SUBCOMMANDS].sort());
  for (const forbidden of ["reset", "stash", "checkout", "rebase", "switch", "restore", "clean", "branch"]) {
    assert.ok(!TRIAGE_GIT_SUBCOMMANDS.includes(forbidden), forbidden);
  }
  const sha = "a".repeat(40);
  for (const args of [
    ["reset", "--hard", sha],
    ["stash"],
    ["checkout", "--", "src/value.txt"],
    ["rebase", "master"],
    ["push", "--force", "origin", `${sha}:refs/heads/${BRANCH}`],
    ["push", "origin", `+${sha}:refs/heads/${BRANCH}`],
    ["push", "--force-with-lease", `${sha}:refs/heads/${BRANCH}`],
    ["merge", "master"],
    ["commit", "--no-verify", "-m", "merge"],
    ["diff", "--no-verify"],
  ]) {
    assert.throws(() => assertAllowedGitCommand(args), { code: "forbidden_git_command" }, args.join(" "));
  }
  // Every git call goes through the guarded runner, and the module calls no
  // other program, so it cannot reach gh merge --admin either.
  const source = readFileSync(new URL("./conflict-triage.mjs", import.meta.url), "utf8");
  assert.equal(source.match(/spawnSync\(/g).length, 1);
  assert.ok(source.includes('spawnSync("git", args'));
  assert.ok(!/execFile|execSync|exec\(|"gh"/.test(source));
});

test("renders the Conflict triage record for a push and for a stop", () => {
  const base = "b".repeat(40);
  const head = "c".repeat(40);
  const merge = "d".repeat(40);
  const pushed = renderTriageRecord({
    answers: [{ citation: "src/value.txt:1", fact: "master renamed the value", id: "Q1" }],
    conflicts: [{ class: "source", code: "UU", path: "src/value.txt" }],
    decisions: [COMBINED[0]],
    mergeSha: merge,
    recordedBase: base,
    trustedHead: head,
    verification: [{ name: "npm test", result: "pass" }],
  });
  for (const expected of [
    "## Conflict triage",
    `- Base: \`${base}\``,
    `- Trusted head: \`${head}\``,
    `- Merge: \`${merge}\``,
    "- Stop: none",
    "| `src/value.txt` | source | combine | AC-1 keeps both values | Q1 |",
    "- Q1: master renamed the value (src/value.txt:1)",
    "- npm test: pass",
  ]) {
    assert.ok(pushed.includes(expected), expected);
  }
  const stopped = renderTriageRecord({
    conflicts: [{ class: "binary", code: "UU", path: "a|b.bin" }],
    recordedBase: base,
    stop: { decisionNeeded: "Decide by hand.", reason: "Binary path.", stop: "unresolvable_paths" },
    trustedHead: head,
  });
  for (const expected of [
    "- Merge: none",
    "- Stop: unresolvable_paths: Binary path.",
    "- Decision needed: Decide by hand.",
    "| `a\\|b.bin` | binary | none | none | none |",
    "Investigator answers used:\n- none",
    "Verification:\n- none",
  ]) {
    assert.ok(stopped.includes(expected), expected);
  }
});
