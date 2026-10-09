// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: The tests inspect a real Git CLI.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: The tests read the module source and remove fixture files.
import { readFileSync, rmSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: The tests address fixture files.
import { join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  abortOwnMerge,
  assertAllowedGitCommand,
  checkRegeneration,
  commitMerge,
  pushMerge,
  renderTriageRecord,
  startTriage,
  TRIAGE_GIT_SUBCOMMANDS,
  TriageStop,
  verifyResolution,
} from "./conflict-triage.mjs";
import {
  BRANCH,
  commit,
  createScenario,
  originHead,
  sh,
  textScenario,
  writeFiles,
} from "./conflict-triage.test-support.mjs";

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

test("aborts its own merge when a git read fails after the merge starts", () => {
  const scenario = textScenario();
  try {
    const failing = (args, codes) => {
      if (args[0] === "ls-files") {
        throw new Error("simulated read failure");
      }
      return scenario.git(args, codes);
    };
    assert.throws(() => startTriage(failing, scenario.input), /simulated read failure/);
    assert.equal(mergeHead(scenario), "");
    assert.equal(sh(scenario.work, ["rev-parse", "HEAD"]), scenario.trustedHead);
    assert.equal(sh(scenario.work, ["status", "--porcelain"]), "");
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
  // Trailing whitespace that master brings in unchanged, or that the generator
  // writes, is not the triage's text, so it must not fail verification.
  const scenario = createScenario({
    base: files("base"),
    branch: files("branch"),
    master: { ...files("master"), "docs/notes.txt": "master note \n" },
  });
  const generators = [{ command: "node build.mjs", paths: ["dist/*.js"] }];
  const rebuilt = '// @generated\nconsole.log("branch master"); \n';
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
      { path: "src/value.txt", problem: "only a declared generated path can be regenerated" },
    ]);
    // The rebuilt bundle differs from both sides, so a combine decision would
    // look visible; only the generated-path rule catches it.
    const handPicked = [{ ...decisions[0], decision: "combine" }, decisions[1]];
    assert.deepEqual(verifyResolution(scenario.git, { ...started, decisions: handPicked, generators }).problems, [
      { path: "dist/out.js", problem: "a declared generated path must be regenerated" },
    ]);
    assert.deepEqual(verifyResolution(scenario.git, { ...started, decisions, generators }), { ok: true, problems: [] });
    const mergeSha = commitMerge(scenario.git, { ...started, message: "merge" });
    assert.equal(
      sh(scenario.work, ["rev-list", "--parents", "-n", "1", mergeSha]),
      `${mergeSha} ${scenario.trustedHead} ${scenario.baseSha}`,
    );
    assert.equal(sh(scenario.work, ["show", `${mergeSha}:dist/out.js`]), rebuilt.trim());
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

// Starts a triage, resolves it, and records the merge commit, so a test can
// drive only the push.
function committedScenario() {
  const scenario = textScenario();
  const started = startTriage(scenario.git, scenario.input);
  resolveCombined(scenario);
  const mergeSha = commitMerge(scenario.git, { ...started, message: "merge" });
  return { mergeSha, scenario, started };
}

// Wraps the real runner so chosen git calls fail the way a dropped connection
// does: "fail" fails before git runs, "fail-after" fails after it ran.
function flakyRunner(scenario, plans) {
  const pushes = [];
  const runner = (args, codes) => {
    if (args[0] === "push") {
      pushes.push(args);
    }
    const plan = plans[args[0]]?.shift();
    if (plan === "fail") {
      throw new Error("fatal: unable to access origin: Could not resolve host");
    }
    const result = scenario.git(args, codes);
    if (plan === "fail-after") {
      throw new Error("fatal: the remote end hung up unexpectedly");
    }
    return result;
  };
  return { pushes, runner };
}

test("reads back an uncertain push and retries it once", async () => {
  const cases = [
    { expectedPushes: 2, name: "retry succeeds", plans: { push: ["fail"] } },
    { expectedPushes: 1, name: "push landed before the error", plans: { push: ["fail-after"] } },
    { expectedPushes: 2, name: "ls-remote fails, retry succeeds", plans: { "ls-remote": ["fail"], push: ["fail"] } },
  ];
  for (const { expectedPushes, name, plans } of cases) {
    const { mergeSha, scenario, started } = committedScenario();
    try {
      const { pushes, runner } = flakyRunner(scenario, plans);
      const pushed = await pushMerge(runner, { ...started, branch: BRANCH, readPullRequest: () => scenario.pullRequest });
      assert.equal(pushed.remoteHead, mergeSha, name);
      assert.equal(pushes.length, expectedPushes, name);
      assert.equal(originHead(scenario), mergeSha, name);
    } finally {
      scenario.cleanup();
    }
  }
});

test("stops with both SHAs when an uncertain push fails twice or the readback is unknown", async () => {
  const failing = committedScenario();
  try {
    const { pushes, runner } = flakyRunner(failing.scenario, {
      "ls-remote": ["fail", "fail"],
      push: ["fail", "fail"],
    });
    const stop = await asyncStopOf(() =>
      pushMerge(runner, { ...failing.started, branch: BRANCH, readPullRequest: () => failing.scenario.pullRequest }),
    );
    assert.equal(stop.code, "push_failed");
    assert.equal(stop.details.expected, failing.mergeSha);
    assert.equal(stop.details.observed, "unknown");
    assert.equal(pushes.length, 2);
    assert.equal(originHead(failing.scenario), failing.scenario.trustedHead);
  } finally {
    failing.scenario.cleanup();
  }
  const unread = committedScenario();
  try {
    const { runner } = flakyRunner(unread.scenario, { "ls-remote": ["fail"] });
    const stop = await asyncStopOf(() =>
      pushMerge(runner, { ...unread.started, branch: BRANCH, readPullRequest: () => unread.scenario.pullRequest }),
    );
    assert.equal(stop.code, "readback_mismatch");
    assert.deepEqual([stop.details.expected, stop.details.observed], [unread.mergeSha, "unknown"]);
  } finally {
    unread.scenario.cleanup();
  }
});

test("a rerun after a post-commit stop names the pending merge, and push can resume it", async () => {
  const { mergeSha, scenario, started } = committedScenario();
  try {
    const moved = { ...scenario.pullRequest, baseSha: "e".repeat(40) };
    const pushStop = await asyncStopOf(() =>
      pushMerge(scenario.git, { ...started, branch: BRANCH, readPullRequest: () => moved }),
    );
    assert.equal(pushStop.code, "base_moved");
    const stop = stopOf(() => startTriage(scenario.git, scenario.input));
    assert.equal(stop.code, "own_merge_pending");
    assert.equal(stop.details.mergeSha, mergeSha);
    assert.deepEqual(stop.details.parents, [scenario.trustedHead, scenario.baseSha]);
    assert.equal(stop.details.recordedBase, scenario.baseSha);
    assert.ok(stop.details.decisionNeeded.includes(`git reset --keep ${scenario.trustedHead}`));
    assert.equal(originHead(scenario), scenario.trustedHead);
    const resumed = await pushMerge(scenario.git, {
      branch: BRANCH,
      readPullRequest: () => scenario.pullRequest,
      recordedBase: stop.details.recordedBase,
      trustedHead: scenario.trustedHead,
    });
    assert.equal(resumed.remoteHead, mergeSha);
    assert.equal(originHead(scenario), mergeSha);
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
