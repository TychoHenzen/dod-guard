// biome-ignore lint/correctness/noNodejsModules: The command reads and writes its state file.
import { readFileSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: The command resolves the state path.
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  abortOwnMerge,
  checkRegeneration,
  commitMerge,
  pushMerge,
  renderTriageRecord,
  startTriage,
  TriageStop,
  verifyResolution,
} from "./conflict-triage.mjs";
import { GitHubClient } from "./github-client.mjs";

export const USAGE = `Usage: node conflict-triage.mjs <command> --state <file> [options]
  start   --state <file> --repository <owner/repository> --pull <number> --trusted-head <sha>
          --generators <file>
  verify  --state <file> --decisions <file>
  regen-check --state <file> [--expect-clean]
  commit  --state <file> (--message <text> | --amend)
  push    --state <file>
  abort   --state <file>
  record  --state <file> [--decisions <file>] [--answers <file>] [--verification <file>] [--merge <sha>]
          [--stop <file>]
The state file and every input file live outside the repository.
`;

export class UsageError extends Error {}

const BOOLEAN_FLAGS = new Set(["--amend", "--expect-clean"]);

export function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) {
      throw new UsageError(`Unexpected argument: ${name}`);
    }
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name.slice(2)] = true;
      continue;
    }
    if (index + 1 >= argv.length) {
      throw new UsageError(`Missing value for ${name}`);
    }
    flags[name.slice(2)] = argv[index + 1];
    index += 1;
  }
  return flags;
}

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

function readJson(path) {
  return path ? JSON.parse(readFileSync(path, "utf8")) : undefined;
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

function start(git, flags, { createClient, statePath }) {
  const repository = required(flags, "repository");
  const pullNumber = Number.parseInt(required(flags, "pull"), 10);
  const trustedHead = required(flags, "trusted-head");
  // The generator list is required so that "none declared" is an explicit []:
  // a missing list would let a generated path be classified as source.
  const generators = readJson(outsideRepository(git, required(flags, "generators")));
  const client = createClient(repository, pullNumber);
  const pullRequest = client.getPullRequest();
  const input = {
    defaultBranch: client.getRepository().defaultBranch,
    generators,
    pullRequest,
    repository,
    trustedHead,
  };
  const state = {
    branch: pullRequest.headBranch,
    ...carriedState(statePath, pullNumber, trustedHead),
    generators,
    pullNumber,
    repository,
    stop: null,
    trustedHead,
  };
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
      state.conflicts = error.details.conflicts ?? state.conflicts;
      state.recordedBase = error.details.recordedBase ?? state.recordedBase;
      state.stop = error.toJSON();
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
      answers: readJson(flags.answers) ?? [],
      decisions: readJson(flags.decisions) ?? [],
      mergeSha: flags.merge ?? state.mergeSha ?? null,
      stop: readJson(flags.stop) ?? state.stop ?? null,
      verification: readJson(flags.verification) ?? [],
    }),
  "regen-check": (git, flags, { state }) =>
    checkRegeneration(git, { expectClean: flags["expect-clean"] === true, generators: state.generators ?? [] }),
  verify: (git, flags, { state }) =>
    verifyResolution(git, { ...state, decisions: readJson(outsideRepository(git, required(flags, "decisions"))) }),
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
  return await COMMANDS[command](git, flags, { createClient, state: readJson(statePath), statePath });
}
