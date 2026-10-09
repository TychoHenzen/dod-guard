// Shared git fixtures for the conflict triage tests: a bare origin and a clone
// whose PBI branch and master both changed the same paths.
// biome-ignore lint/correctness/noNodejsModules: The fixtures drive a real Git CLI.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: The fixtures write temporary repositories.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: The fixtures write temporary repositories.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: The fixtures write temporary repositories.
import { dirname, join } from "node:path";
import { createGitRunner } from "./conflict-triage.mjs";

export const REPOSITORY = "owner/repo";
export const BRANCH = "codex/1-triage";

// Fixture commands run outside the module under test, so they use a plain
// runner that the triage allowlist does not restrict.
export function sh(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

export function writeFiles(work, files) {
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

export function commit(work, files, message) {
  writeFiles(work, files);
  sh(work, ["add", "-A"]);
  sh(work, ["commit", "-q", "-m", message]);
  return sh(work, ["rev-parse", "HEAD"]);
}

// Builds a bare origin and a clone whose PBI branch and master both changed the
// given paths since their common base. The clone ends on the PBI branch.
export function createScenario({ base, branch, master }) {
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
    root,
    trustedHead,
    work,
  };
}

export function textScenario() {
  return createScenario({
    base: { "src/value.txt": "one\n", "test/value.test.js": "expect(1);\n" },
    branch: { "src/value.txt": "branch\n", "test/value.test.js": "expect(2);\n" },
    master: { "src/value.txt": "master\n", "test/value.test.js": "expect(3);\n" },
  });
}

export function originHead(scenario) {
  return sh(scenario.origin, ["rev-parse", `refs/heads/${BRANCH}`]);
}
