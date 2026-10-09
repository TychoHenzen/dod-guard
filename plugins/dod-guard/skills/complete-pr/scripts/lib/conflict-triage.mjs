// biome-ignore lint/correctness/noNodejsModules: This adapter invokes the local Git CLI from Node.
import { spawnSync } from "node:child_process";

// The rules these mechanics enforce live in standards/conflict-triage.md. This
// module owns only the deterministic git steps, and it fails closed: every
// unexpected state is a TriageStop that names what was expected and observed.

// The triage may run only these git subcommands. Reset, stash, path checkout,
// rebase, and a forced push are outside its authority, so the runner refuses
// them before git starts.
export const TRIAGE_GIT_SUBCOMMANDS = Object.freeze([
  "cat-file",
  "commit",
  "diff",
  "ls-files",
  "ls-remote",
  "merge",
  "push",
  "rev-list",
  "rev-parse",
  "status",
]);

export const STOP_CLASSES = Object.freeze(["binary", "modify-delete", "unclassified", "undeclared-generated"]);

const SHA = /^[0-9a-f]{40}$/;
const PUSH_REFSPEC = /^[0-9a-f]{40}:refs\/heads\/[^+:\s]+$/;
const PUSH_REJECTED = /\[rejected\]|\[remote rejected\]|non-fast-forward|fetch first|stale info/i;
const FORBIDDEN_ARGUMENTS = new Set([
  "--force",
  "-f",
  "--force-with-lease",
  "--force-if-includes",
  "--mirror",
  "--delete",
  "--hard",
  "--no-verify",
]);
const UNMERGED_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
const CONTENT_CONFLICT_CODES = new Set(["UU", "AA"]);
const MODIFY_DELETE_CODES = new Set(["UD", "DU"]);
const SPECIAL_MODES = new Set(["120000", "160000"]);
const TEST_PATH = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[^/]+$/i;
// A file that announces it is generated, but matches no generator the target
// repository declares, must not be hand-merged.
const GENERATED_MARKER = /@generated|do not edit/i;
const GENERATED_PROBE_LINES = 5;
// Git treats a NUL byte in the first 8000 bytes as binary content.
const BINARY_PROBE_LENGTH = 8000;
const CONFLICT_MARKER = /^(?:<{7}|>{7}|\|{7})(?: |$)|^={7}$/m;
const DECISIONS = new Set(["take-branch", "take-base", "combine", "regenerate"]);

const ALLOWED_FORMS = {
  commit: (rest) => (rest.length === 2 && rest[0] === "-m") || (rest.length === 2 && rest[0] === "--amend" && rest[1] === "--no-edit"),
  merge: (rest) =>
    (rest.length === 3 && rest[0] === "--no-ff" && rest[1] === "--no-commit" && SHA.test(rest[2])) ||
    (rest.length === 1 && rest[0] === "--abort"),
  push: (rest) => rest.length === 2 && !rest[0].startsWith("-") && PUSH_REFSPEC.test(rest[1]),
};

export class TriageStop extends Error {
  constructor(code, reason, details = {}) {
    super(reason);
    this.name = "TriageStop";
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { stop: this.code, reason: this.message, ...this.details };
  }
}

export function assertAllowedGitCommand(args) {
  const [subcommand, ...rest] = args;
  const form = ALLOWED_FORMS[subcommand];
  let allowed = TRIAGE_GIT_SUBCOMMANDS.includes(subcommand);
  if (allowed && form) {
    allowed = form(rest);
  } else if (allowed) {
    allowed = !rest.some((argument) => FORBIDDEN_ARGUMENTS.has(argument));
  }
  if (!allowed) {
    throw new TriageStop("forbidden_git_command", `The triage may not run: git ${args.join(" ")}`);
  }
}

export function createGitRunner(cwd) {
  return (args, acceptedExitCodes = [0]) => {
    assertAllowedGitCommand(args);
    const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, windowsHide: true });
    if (result.error) {
      throw result.error;
    }
    if (!acceptedExitCodes.includes(result.status)) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || `git exited with ${result.status}`);
    }
    return result;
  };
}

function parseStatus(output) {
  const entries = [];
  const fields = output.split("\0");
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field.length < 4) {
      continue;
    }
    const code = field.slice(0, 2);
    entries.push({ code, path: field.slice(3) });
    // A rename or copy carries its source path in the next field.
    if (code[0] === "R" || code[0] === "C") {
      index += 1;
    }
  }
  return entries;
}

function pendingPaths(git) {
  return parseStatus(git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout).map((entry) => entry.path);
}

function readHead(git) {
  return git(["rev-parse", "HEAD"]).stdout.trim();
}

function currentBranch(git) {
  return git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
}

function readMergeHead(git) {
  const result = git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], [0, 1]);
  return result.status === 0 ? result.stdout.trim() : null;
}

function objectId(git, spec) {
  const result = git(["rev-parse", "-q", "--verify", spec], [0, 1, 128]);
  return result.status === 0 ? result.stdout.trim() : null;
}

function readBlob(git, spec) {
  return git(["cat-file", "blob", spec]).stdout;
}

function headParents(git) {
  const [, ...parents] = git(["rev-list", "--parents", "-n", "1", "HEAD"]).stdout.trim().split(" ");
  return parents;
}

function parentsMatch(parents, trustedHead, recordedBase) {
  return parents.length === 2 && parents[0] === trustedHead && parents[1] === recordedBase;
}

const PRECONDITIONS = [
  ["pull_request_not_open", "The pull request is not open.", (input) => input.pullRequest.state === "OPEN"],
  [
    "fork_head",
    "The head branch is not in this repository.",
    (input) => input.pullRequest.headRepository === input.repository,
  ],
  [
    "base_not_default",
    "The pull request base is not the default branch.",
    (input) => input.pullRequest.baseBranch === input.defaultBranch,
  ],
  ["trusted_head_invalid", "The trusted head is not a full commit SHA.", (input) => SHA.test(input.trustedHead ?? "")],
  [
    "head_moved",
    "The pull request head is not the trusted head.",
    (input) => input.pullRequest.headSha === input.trustedHead,
  ],
  ["base_unknown", "The pull request base SHA is unknown.", (input) => SHA.test(input.pullRequest.baseSha ?? "")],
];

export function checkPreconditions(git, input) {
  for (const [code, reason, holds] of PRECONDITIONS) {
    if (!holds(input)) {
      throw new TriageStop(code, reason, { pullRequest: input.pullRequest, trustedHead: input.trustedHead });
    }
  }
  const { pullRequest, trustedHead } = input;
  const branch = currentBranch(git);
  if (branch !== pullRequest.headBranch) {
    throw new TriageStop("wrong_branch", "The checkout is not on the pull request head branch.", {
      expected: pullRequest.headBranch,
      observed: branch,
    });
  }
  const head = readHead(git);
  if (head !== trustedHead) {
    throw new TriageStop("local_head_mismatch", "The checkout is not at the trusted head.", {
      expected: trustedHead,
      observed: head,
    });
  }
  const mergeHead = readMergeHead(git);
  if (mergeHead) {
    throw new TriageStop("merge_in_progress", "A merge is already in progress in this checkout.", {
      observed: mergeHead,
    });
  }
  const pending = pendingPaths(git);
  if (pending.length > 0) {
    throw new TriageStop("worktree_dirty", "The worktree has pending changes.", { paths: pending });
  }
  if (git(["cat-file", "-e", `${pullRequest.baseSha}^{commit}`], [0, 1, 128]).status !== 0) {
    throw new TriageStop("base_not_local", "The recorded base commit is not in this clone. Fetch the default branch before the run.", {
      expected: pullRequest.baseSha,
    });
  }
  return { recordedBase: pullRequest.baseSha, trustedHead };
}

function readStages(git, path) {
  return git(["ls-files", "-u", "-z", "--", path])
    .stdout.split("\0")
    .filter(Boolean)
    .map((line) => {
      const [mode, sha, stage] = line.split("\t")[0].split(" ");
      return { mode, sha, stage: Number(stage) };
    });
}

export function listConflicts(git) {
  return parseStatus(git(["status", "--porcelain=v1", "-z", "--untracked-files=no"]).stdout)
    .filter((entry) => UNMERGED_CODES.has(entry.code))
    .map(({ code, path }) => ({ code, path, stages: readStages(git, path) }));
}

function globToRegExp(glob) {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (glob.startsWith("**/", index)) {
      source += "(?:.*/)?";
      index += 2;
    } else if (glob.startsWith("**", index)) {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

export function validateGenerators(generators) {
  const valid =
    Array.isArray(generators) &&
    generators.every(
      (generator) =>
        Array.isArray(generator?.paths) &&
        generator.paths.length > 0 &&
        generator.paths.every((path) => typeof path === "string" && path.length > 0) &&
        typeof generator.command === "string" &&
        generator.command.trim().length > 0,
    );
  if (!valid) {
    throw new TriageStop("generators_invalid", "Each declared generator needs non-empty paths and a command.");
  }
  return generators;
}

export function findGenerator(path, generators) {
  return generators.find((generator) => generator.paths.some((glob) => globToRegExp(glob).test(path))) ?? null;
}

function classifyConflict(git, conflict, generators) {
  if (!CONTENT_CONFLICT_CODES.has(conflict.code)) {
    return MODIFY_DELETE_CODES.has(conflict.code) ? "modify-delete" : "unclassified";
  }
  if (conflict.stages.some((stage) => SPECIAL_MODES.has(stage.mode))) {
    return "unclassified";
  }
  if (findGenerator(conflict.path, generators)) {
    return "generated";
  }
  const sides = conflict.stages.filter((stage) => stage.stage !== 1).map((stage) => readBlob(git, stage.sha));
  if (sides.some((text) => text.slice(0, BINARY_PROBE_LENGTH).includes("\0"))) {
    return "binary";
  }
  if (sides.some((text) => GENERATED_MARKER.test(text.split("\n", GENERATED_PROBE_LINES).join("\n")))) {
    return "undeclared-generated";
  }
  return TEST_PATH.test(conflict.path) ? "test" : "source";
}

export function classifyConflicts(git, conflicts, generators = []) {
  return conflicts.map(({ code, path, stages }) => ({
    class: classifyConflict(git, { code, path, stages }, generators),
    code,
    path,
  }));
}

// After a declared generator runs, every change it leaves must be one of its
// declared outputs. A second run that still changes anything is drift.
export function checkRegeneration(git, { generators = [], expectClean = false }) {
  validateGenerators(generators);
  const changed = parseStatus(git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout)
    .filter((entry) => entry.code[1] !== " ")
    .map((entry) => entry.path);
  const problems = [];
  for (const path of changed) {
    if (expectClean) {
      problems.push({ path, problem: "the generator changed this path again (drift)" });
    } else if (!findGenerator(path, generators)) {
      problems.push({ path, problem: "the generator changed a path it does not declare" });
    }
  }
  return { generatedPaths: changed, ok: problems.length === 0, problems };
}

export function abortOwnMerge(git, recordedBase) {
  const mergeHead = readMergeHead(git);
  if (mergeHead === null) {
    return "none";
  }
  if (mergeHead !== recordedBase) {
    return "not-owned";
  }
  git(["merge", "--abort"]);
  return "aborted";
}

export function startTriage(git, input) {
  const generators = validateGenerators(input.generators ?? []);
  const { recordedBase, trustedHead } = checkPreconditions(git, input);
  git(["merge", "--no-ff", "--no-commit", recordedBase], [0, 1]);
  const mergeHead = readMergeHead(git);
  if (mergeHead !== recordedBase) {
    throw new TriageStop("merge_not_started", "Git did not start a merge with the recorded base.", {
      expected: recordedBase,
      merge: abortOwnMerge(git, recordedBase),
      observed: mergeHead,
    });
  }
  const conflicts = classifyConflicts(git, listConflicts(git), generators);
  const blocked = conflicts.filter((conflict) => STOP_CLASSES.includes(conflict.class));
  if (blocked.length > 0) {
    throw new TriageStop("unresolvable_paths", "Some conflicted paths cannot be triaged automatically.", {
      conflicts,
      decisionNeeded: "Resolve each listed path by hand or state which side wins, then run /complete-pr again.",
      merge: abortOwnMerge(git, recordedBase),
      paths: blocked.map((conflict) => `${conflict.path} (${conflict.class})`),
      recordedBase,
      trustedHead,
    });
  }
  return { conflicts, recordedBase, trustedHead };
}

function resolutionSource(git, trustedHead, recordedBase) {
  const mergeHead = readMergeHead(git);
  if (mergeHead === recordedBase) {
    return "";
  }
  if (mergeHead === null && parentsMatch(headParents(git), trustedHead, recordedBase)) {
    return "HEAD";
  }
  throw new TriageStop("merge_not_owned", "The checkout does not hold this run's merge.", {
    expected: recordedBase,
    observed: mergeHead ?? readHead(git),
  });
}

function unbasedConflicts(conflicts, decisionByPath) {
  return conflicts.filter((conflict) => {
    const decision = decisionByPath.get(conflict.path);
    return !(decision && DECISIONS.has(decision.decision) && String(decision.basis ?? "").trim() !== "");
  });
}

function decisionVisible(decision, ids, path, generators) {
  switch (decision) {
    case "take-branch":
      return ids.resolved === ids.branch;
    case "take-base":
      return ids.resolved === ids.base;
    case "combine":
      return ids.resolved !== null && ids.resolved !== ids.branch && ids.resolved !== ids.base;
    default:
      return findGenerator(path, generators) !== null;
  }
}

export function verifyResolution(git, { trustedHead, recordedBase, conflicts, decisions = [], generators = [] }) {
  const source = resolutionSource(git, trustedHead, recordedBase);
  const decisionByPath = new Map(decisions.map((decision) => [decision.path, decision]));
  const unbased = unbasedConflicts(conflicts, decisionByPath);
  if (unbased.length > 0) {
    throw new TriageStop("decision_without_basis", "Every conflicted path needs a judged decision with a basis.", {
      decisionNeeded: "Judge each listed path with a stated basis, or decide it by hand.",
      paths: unbased.map((conflict) => conflict.path),
    });
  }
  const problems = [];
  for (const conflict of listConflicts(git)) {
    problems.push({ path: conflict.path, problem: "still unmerged" });
  }
  const unstaged =
    source === "" ? git(["diff", "--name-only", "-z"]).stdout.split("\0").filter(Boolean) : pendingPaths(git);
  for (const path of unstaged) {
    problems.push({ path, problem: "change is not in the resolution" });
  }
  const checkArgs = source === "" ? ["diff", "--cached", "--check"] : ["diff", "--check", trustedHead, "HEAD"];
  const check = git(checkArgs, [0, 2]).stdout.trim();
  if (check) {
    problems.push({ path: null, problem: `git diff --check: ${check}` });
  }
  for (const conflict of conflicts) {
    const { decision } = decisionByPath.get(conflict.path);
    const ids = {
      base: objectId(git, `${recordedBase}:${conflict.path}`),
      branch: objectId(git, `${trustedHead}:${conflict.path}`),
      resolved: objectId(git, `${source}:${conflict.path}`),
    };
    if (ids.resolved !== null && CONFLICT_MARKER.test(readBlob(git, `${source}:${conflict.path}`))) {
      problems.push({ path: conflict.path, problem: "conflict markers remain" });
    }
    if (!decisionVisible(decision, ids, conflict.path, generators)) {
      problems.push({ path: conflict.path, problem: `decision ${decision} is not visible in the resolution` });
    }
  }
  return { ok: problems.length === 0, problems };
}

export function checkProvenance(git, { trustedHead, recordedBase }) {
  const parents = headParents(git);
  if (!parentsMatch(parents, trustedHead, recordedBase)) {
    throw new TriageStop("provenance_mismatch", "The merge commit must have exactly the trusted head and the recorded base as parents.", {
      expected: [trustedHead, recordedBase],
      observed: parents,
    });
  }
  return readHead(git);
}

export function commitMerge(git, { trustedHead, recordedBase, message = "", amend = false }) {
  if (amend) {
    checkProvenance(git, { recordedBase, trustedHead });
    git(["commit", "--amend", "--no-edit"]);
  } else {
    if (readMergeHead(git) !== recordedBase) {
      throw new TriageStop("merge_not_owned", "The checkout does not hold this run's merge.", { expected: recordedBase });
    }
    if (listConflicts(git).length > 0) {
      throw new TriageStop("unmerged_paths", "Unmerged paths remain.", {
        paths: listConflicts(git).map((conflict) => conflict.path),
      });
    }
    if (message.trim() === "") {
      throw new TriageStop("message_missing", "The merge commit needs a message.");
    }
    git(["commit", "-m", message]);
  }
  return checkProvenance(git, { recordedBase, trustedHead });
}

function tryPush(git, args) {
  try {
    git(args);
    return null;
  } catch (error) {
    return error.message;
  }
}

function readRemoteHead(git, remote, branch) {
  const line = git(["ls-remote", remote, `refs/heads/${branch}`]).stdout.trim();
  return line ? line.split(/\s+/)[0] : null;
}

export async function pushMerge(git, { remote = "origin", branch, trustedHead, recordedBase, readPullRequest }) {
  const mergeSha = checkProvenance(git, { recordedBase, trustedHead });
  const pending = pendingPaths(git);
  if (pending.length > 0) {
    throw new TriageStop("worktree_dirty", "The worktree has changes outside the merge commit.", { paths: pending });
  }
  const pullRequest = await readPullRequest();
  if (pullRequest.headSha !== trustedHead) {
    throw new TriageStop("head_moved", "The pull request head changed during the run.", {
      expected: trustedHead,
      observed: pullRequest.headSha,
    });
  }
  if (pullRequest.baseSha !== recordedBase) {
    throw new TriageStop("base_moved", "The pull request base changed during the run.", {
      expected: recordedBase,
      observed: pullRequest.baseSha,
    });
  }
  const args = ["push", remote, `${mergeSha}:refs/heads/${branch}`];
  let failure = tryPush(git, args);
  // Read back an uncertain push before retrying the identical command once.
  if (failure && !PUSH_REJECTED.test(failure) && readRemoteHead(git, remote, branch) !== mergeSha) {
    failure = tryPush(git, args);
  } else if (failure && !PUSH_REJECTED.test(failure)) {
    failure = null;
  }
  if (failure) {
    throw new TriageStop(PUSH_REJECTED.test(failure) ? "push_rejected" : "push_failed", failure, {
      expected: trustedHead,
      mergeSha,
    });
  }
  const remoteHead = readRemoteHead(git, remote, branch);
  if (remoteHead !== mergeSha) {
    throw new TriageStop("readback_mismatch", "The remote head does not read back as the merge commit.", {
      expected: mergeSha,
      observed: remoteHead,
    });
  }
  return { mergeSha, parents: [trustedHead, recordedBase], remoteHead };
}

function cell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

function listOrNone(items, render) {
  return items.length === 0 ? ["- none"] : items.map(render);
}

export function renderTriageRecord({
  trustedHead,
  recordedBase,
  mergeSha = null,
  conflicts = [],
  decisions = [],
  answers = [],
  verification = [],
  stop = null,
}) {
  const decisionByPath = new Map(decisions.map((decision) => [decision.path, decision]));
  const lines = [
    "## Conflict triage",
    "",
    `- Base: \`${recordedBase}\``,
    `- Trusted head: \`${trustedHead}\``,
    `- Merge: ${mergeSha ? `\`${mergeSha}\`` : "none"}`,
    `- Stop: ${stop ? `${stop.stop}: ${cell(stop.reason)}` : "none"}`,
  ];
  if (stop?.decisionNeeded) {
    lines.push(`- Decision needed: ${cell(stop.decisionNeeded)}`);
  }
  lines.push("", "| Path | Class | Decision | Basis | Questions |", "|---|---|---|---|---|");
  for (const conflict of conflicts) {
    const decision = decisionByPath.get(conflict.path) ?? {};
    const questions = (decision.questionIds ?? []).join(", ") || "none";
    lines.push(
      `| \`${cell(conflict.path)}\` | ${cell(conflict.class)} | ${cell(decision.decision ?? "none")} | ${cell(decision.basis ?? "none")} | ${cell(questions)} |`,
    );
  }
  lines.push("", "Investigator answers used:");
  lines.push(...listOrNone(answers, (answer) => `- ${answer.id}: ${cell(answer.fact)} (${cell(answer.citation)})`));
  lines.push("", "Verification:");
  lines.push(...listOrNone(verification, (entry) => `- ${cell(entry.name)}: ${cell(entry.result)}`));
  return `${lines.join("\n")}\n`;
}
