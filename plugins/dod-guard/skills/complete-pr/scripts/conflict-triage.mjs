#!/usr/bin/env node
// biome-ignore lint/correctness/noNodejsModules: This shipped command reads and writes its state file.
import { readFileSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This shipped command resolves the state path.
import { isAbsolute, relative, resolve } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This shipped command runs in Node.
import process from "node:process";
import {
  abortOwnMerge,
  checkRegeneration,
  commitMerge,
  createGitRunner,
  pushMerge,
  renderTriageRecord,
  startTriage,
  TriageStop,
  verifyResolution,
} from "./lib/conflict-triage.mjs";
import { GitHubClient } from "./lib/github-client.mjs";

const USAGE = `Usage: node conflict-triage.mjs <command> --state <file> [options]
  start   --state <file> --repository <owner/repository> --pull <number> --trusted-head <sha> [--generators <file>]
  verify  --state <file> --decisions <file>
  regen-check --state <file> [--expect-clean]
  commit  --state <file> (--message <text> | --amend)
  push    --state <file>
  abort   --state <file>
  record  --state <file> [--decisions <file>] [--answers <file>] [--verification <file>] [--merge <sha>] [--stop <file>]
The state file and every input file live outside the repository.
`;

class UsageError extends Error {}

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) {
      throw new UsageError(`Unexpected argument: ${name}`);
    }
    if (name === "--amend" || name === "--expect-clean") {
      flags[name.slice(2)] = true;
    } else if (index + 1 < argv.length) {
      flags[name.slice(2)] = argv[index + 1];
      index += 1;
    } else {
      throw new UsageError(`Missing value for ${name}`);
    }
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
  if (fromRoot === "" || !(fromRoot.startsWith("..") || isAbsolute(fromRoot))) {
    throw new UsageError(`Keep ${path} outside the repository.`);
  }
  return path;
}

function readJson(path) {
  return path ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

function start(git, flags, statePath) {
  const repository = required(flags, "repository");
  const pullNumber = Number.parseInt(required(flags, "pull"), 10);
  const client = new GitHubClient(repository, pullNumber);
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

async function runCommand(command, git, flags) {
  const statePath = outsideRepository(git, required(flags, "state"));
  if (command === "start") {
    return start(git, flags, statePath);
  }
  const state = readJson(statePath);
  switch (command) {
    case "verify":
      return verifyResolution(git, { ...state, decisions: readJson(outsideRepository(git, required(flags, "decisions"))) });
    case "regen-check":
      return checkRegeneration(git, { expectClean: flags["expect-clean"] === true, generators: state.generators ?? [] });
    case "commit":
      return { mergeSha: commitMerge(git, { ...state, amend: flags.amend === true, message: flags.message ?? "" }) };
    case "push": {
      const client = new GitHubClient(state.repository, state.pullNumber);
      return await pushMerge(git, { ...state, readPullRequest: () => client.getPullRequest() });
    }
    case "abort":
      return { merge: abortOwnMerge(git, state.recordedBase) };
    case "record":
      return renderTriageRecord({
        ...state,
        answers: readJson(flags.answers) ?? [],
        decisions: readJson(flags.decisions) ?? [],
        mergeSha: flags.merge ?? null,
        stop: readJson(flags.stop) ?? null,
        verification: readJson(flags.verification) ?? [],
      });
    default:
      throw new UsageError(`Unknown command: ${command}`);
  }
}

const [command, ...rest] = process.argv.slice(2);
try {
  const result = await runCommand(command, createGitRunner(process.cwd()), parseFlags(rest));
  process.stdout.write(typeof result === "string" ? result : `${JSON.stringify(result, null, 2)}\n`);
  if (result?.ok === false) {
    process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof UsageError || command === undefined) {
    process.stderr.write(`${error.message}\n${USAGE}`);
    process.exitCode = 2;
  } else if (error instanceof TriageStop) {
    process.stdout.write(`${JSON.stringify(error, null, 2)}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`conflict-triage failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
