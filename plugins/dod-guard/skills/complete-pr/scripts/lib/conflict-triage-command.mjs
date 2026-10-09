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
          [--generators <file>]
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

function start(git, flags, { createClient, statePath }) {
  const repository = required(flags, "repository");
  const pullNumber = Number.parseInt(required(flags, "pull"), 10);
  const client = createClient(repository, pullNumber);
  const input = {
    defaultBranch: client.getRepository().defaultBranch,
    generators: readJson(flags.generators) ?? [],
    pullRequest: client.getPullRequest(),
    repository,
    trustedHead: required(flags, "trusted-head"),
  };
  const save = (result) => {
    const state = {
      branch: input.pullRequest.headBranch,
      conflicts: result.conflicts ?? [],
      generators: input.generators,
      pullNumber,
      recordedBase: result.recordedBase ?? null,
      repository,
      trustedHead: input.trustedHead,
    };
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  };
  try {
    const result = startTriage(git, input);
    save(result);
    return result;
  } catch (error) {
    if (error instanceof TriageStop && error.details.recordedBase) {
      save(error.details);
    }
    throw error;
  }
}

const COMMANDS = {
  abort: (git, _flags, { state }) => ({ merge: abortOwnMerge(git, state.recordedBase) }),
  commit: (git, flags, { state }) => ({
    mergeSha: commitMerge(git, { ...state, amend: flags.amend === true, message: flags.message ?? "" }),
  }),
  push: (git, _flags, { createClient, state }) => {
    const client = createClient(state.repository, state.pullNumber);
    return pushMerge(git, { ...state, readPullRequest: () => client.getPullRequest() });
  },
  record: (_git, flags, { state }) =>
    renderTriageRecord({
      ...state,
      answers: readJson(flags.answers) ?? [],
      decisions: readJson(flags.decisions) ?? [],
      mergeSha: flags.merge ?? null,
      stop: readJson(flags.stop) ?? null,
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
