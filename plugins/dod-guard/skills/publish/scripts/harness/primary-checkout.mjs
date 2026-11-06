import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
    windowsHide: true,
  });
}

export function runGit(cwd, ...args) {
  const result = git(cwd, args);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

export async function createPrimaryCheckout(t) {
  const cwd = await mkdtemp(join(tmpdir(), "dod-guard-publish-primary-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  runGit(cwd, "init");
  runGit(cwd, "config", "user.name", "Publish test");
  runGit(cwd, "config", "user.email", "publish-test@example.invalid");
  runGit(cwd, "config", "commit.gpgsign", "false");
  runGit(cwd, "branch", "-M", "master");
  await writeFile(join(cwd, "tracked.txt"), "base\n");
  runGit(cwd, "add", "--", "tracked.txt");
  runGit(cwd, "commit", "-m", "chore: create base");
  return cwd;
}

// The checkout tests share these helpers so each test function stays under the scanner's length limit.
export async function commitFile(cwd, file, message) {
  await writeFile(join(cwd, file.name), file.content);
  runGit(cwd, "add", "--", file.name);
  runGit(cwd, "commit", "-m", message);
}

export async function createOriginCheckout(t) {
  const cwd = await createPrimaryCheckout(t);
  const remote = join(cwd, ".git", "local-origin.git");
  runGit(cwd, "init", "--bare", remote);
  runGit(cwd, "remote", "add", "origin", remote);
  runGit(cwd, "push", "-u", "origin", "master");
  return { cwd, remote };
}
