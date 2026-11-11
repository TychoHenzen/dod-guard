// biome-ignore lint/correctness/noNodejsModules: The command reads and writes its state file.
import { readFileSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: The command resolves the state path.
import { isAbsolute, relative, resolve, sep } from "node:path";
import { readJsonFile } from "../../../../lib/read-text.mjs";
import {
  abortOwnMerge,
  checkRegeneration,
  commitMerge,
  pushMerge,
  startTriage,
  TriageStop,
  verifyResolution,
} from "./conflict-triage.mjs";
import { UsageError } from "./conflict-triage-flags.mjs";
import { GitHubClient } from "./github-client.mjs";
import { renderTriageRecord } from "./triage-record.mjs";

function required(flags, name) {
  if (!flags[name]) {
    throw new UsageError(`Missing --${name}`);
  }
  return flags[name];
}

// The triage keeps no ledger in the repository: its state lives in the
// caller's scratch directory, and the durable record is the handoff comment.
function outsideRepository(git, path) {
  const root = git(["rev-parse", "--show-toplevel"]).stdout.trim();
  const fromRoot = relative(resolve(root), resolve(path));
  // A name such as "..state.json" starts with two dots but sits inside the
  // root, so only a whole ".." first segment counts as leaving it.
  const outside = fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
  if (!outside) {
    throw new UsageError(`Keep ${path} outside the repository.`);
  }
  return path;
}

function readJsonIfSet(path) {
  return path ? readJsonFile(path) : undefined;
}

function saveState(path, state) {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

function readState(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// A rerun for the same pull request and trusted head keeps the earlier run's
// recorded base and classification, so a stop before this run merges never
// erases what abort and record need from the earlier run.
function carriedState(statePath, pullNumber, trustedHead) {
  const previous = readState(statePath);
  if (previous?.pullNumber !== pullNumber || previous?.trustedHead !== trustedHead) {
    return { conflicts: [], recordedBase: null };
  }
  return { conflicts: previous.conflicts ?? [], recordedBase: previous.recordedBase ?? null };
}

// The generator list is required so that "none declared" is an explicit []:
// a missing list would let a generated path be classified as source.
function readGenerators(git, flags) {
  const generators = readJsonIfSet(outsideRepository(git, required(flags, "generators")));
  if (!Array.isArray(generators)) {
    throw new UsageError("--generators must name a JSON list; pass [] when the repository declares none.");
  }
  return generators;
}

function initialState(run, pullRequest, statePath) {
  const { generators, pullNumber, repository, trustedHead } = run;
  return {
    branch: pullRequest.headBranch,
    ...carriedState(statePath, pullNumber, trustedHead),
    generators,
    pullNumber,
    repository,
    stop: null,
    trustedHead,
  };
}

function recordStop(state, error) {
  state.conflicts = error.details.conflicts ?? state.conflicts;
  state.recordedBase = error.details.recordedBase ?? state.recordedBase;
  state.stop = error.toJSON();
}

function start(git, flags, { createClient, statePath }) {
  const repository = required(flags, "repository");
  const pullNumber = Number.parseInt(required(flags, "pull"), 10);
  const trustedHead = required(flags, "trusted-head");
  const generators = readGenerators(git, flags);
  const client = createClient(repository, pullNumber);
  const pullRequest = client.getPullRequest();
  const run = { generators, pullNumber, repository, trustedHead };
  const input = { ...run, defaultBranch: client.getRepository().defaultBranch, pullRequest };
  const state = initialState(run, pullRequest, statePath);
  const beforeMerge = ({ recordedBase }) => {
    state.conflicts = [];
    state.recordedBase = recordedBase;
    saveState(statePath, state);
  };
  try {
    const result = startTriage(git, input, { beforeMerge });
    state.conflicts = result.conflicts;
    saveState(statePath, state);
    return result;
  } catch (error) {
    if (error instanceof TriageStop) {
      recordStop(state, error);
      saveState(statePath, state);
    }
    throw error;
  }
}

const COMMANDS = {
  abort: (git, _flags, { state }) => ({ merge: abortOwnMerge(git, state.recordedBase) }),
  commit: (git, flags, { state, statePath }) => {
    const mergeSha = commitMerge(git, { ...state, amend: flags.amend === true, message: flags.message ?? "" });
    saveState(statePath, { ...state, mergeSha });
    return { mergeSha };
  },
  push: (git, _flags, { createClient, state }) => {
    const client = createClient(state.repository, state.pullNumber);
    return pushMerge(git, { ...state, readPullRequest: () => client.getPullRequest() });
  },
  record: (_git, flags, { state }) =>
    renderTriageRecord({
      ...state,
      answers: readJsonIfSet(flags.answers) ?? [],
      decisions: readJsonIfSet(flags.decisions) ?? [],
      mergeSha: flags.merge ?? state.mergeSha ?? null,
      stop: readJsonIfSet(flags.stop) ?? state.stop ?? null,
      verification: readJsonIfSet(flags.verification) ?? [],
    }),
  "regen-check": (git, flags, { state }) =>
    checkRegeneration(git, { expectClean: flags["expect-clean"] === true, generators: state.generators ?? [] }),
  verify: (git, flags, { state }) =>
    verifyResolution(git, {
      ...state,
      decisions: readJsonIfSet(outsideRepository(git, required(flags, "decisions"))),
    }),
};

function defaultClient(repository, pullNumber) {
  return new GitHubClient(repository, pullNumber);
}

// createClient is the seam a test uses to supply the pull request without
// calling GitHub; the shipped command always uses the gh-backed client.
export async function runCommand(command, git, flags, { createClient = defaultClient } = {}) {
  const statePath = outsideRepository(git, required(flags, "state"));
  if (command === "start") {
    return start(git, flags, { createClient, statePath });
  }
  if (!Object.hasOwn(COMMANDS, command)) {
    throw new UsageError(`Unknown command: ${command}`);
  }
  return await COMMANDS[command](git, flags, { createClient, state: readJsonIfSet(statePath), statePath });
}
