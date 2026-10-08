import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const skillPath = new URL("../SKILL.md", import.meta.url);

function git(cwd, args) {
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

function runGit(cwd, ...args) {
  const result = git(cwd, args);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function createPrimaryCheckout(t) {
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

test("same-checkout release transition retains staged, unstaged, and untracked release paths", async (t) => {
  const cwd = await createPrimaryCheckout(t);
  const savedSha = runGit(cwd, "rev-parse", "HEAD");
  runGit(cwd, "switch", "-c", "codex/source");
  await writeFile(join(cwd, "staged-release.txt"), "staged release\n");
  runGit(cwd, "add", "--", "staged-release.txt");
  await writeFile(join(cwd, "tracked.txt"), "unstaged release\n");
  await writeFile(join(cwd, "untracked-release.txt"), "untracked release\n");

  const gitDirectory = runGit(cwd, "rev-parse", "--path-format=absolute", "--git-dir");
  const commonDirectory = runGit(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
  assert.equal(resolve(gitDirectory), resolve(commonDirectory));

  runGit(cwd, "switch", "--detach", savedSha);
  assert.equal(runGit(cwd, "rev-parse", "HEAD"), savedSha);
  assert.equal(runGit(cwd, "rev-parse", "refs/heads/codex/source"), savedSha);
  assert.match(
    runGit(cwd, "status", "--porcelain=v1", "--untracked-files=all"),
    /A  staged-release\.txt[\s\S]+ M tracked\.txt[\s\S]+\?\? untracked-release\.txt/,
  );
  assert.equal(await readFile(join(cwd, "staged-release.txt"), "utf8"), "staged release\n");
  assert.equal(await readFile(join(cwd, "tracked.txt"), "utf8"), "unstaged release\n");
  assert.equal(await readFile(join(cwd, "untracked-release.txt"), "utf8"), "untracked release\n");

  runGit(cwd, "add", "--", "staged-release.txt", "tracked.txt", "untracked-release.txt");
  runGit(cwd, "commit", "-m", "chore: add release content");
  assert.equal(runGit(cwd, "rev-parse", "HEAD^"), savedSha);
});

test("same-checkout release uses the fetched origin master SHA as its parent", async (t) => {
  const cwd = await createPrimaryCheckout(t);
  const remote = join(cwd, ".git", "local-origin.git");
  runGit(cwd, "init", "--bare", remote);
  runGit(cwd, "remote", "add", "origin", remote);
  runGit(cwd, "push", "-u", "origin", "master");
  const startingSha = runGit(cwd, "rev-parse", "HEAD");

  runGit(cwd, "switch", "-c", "codex/source");
  runGit(cwd, "switch", "-c", "codex/remote-master-advance", startingSha);
  await writeFile(join(cwd, "remote-change.txt"), "remote master content\n");
  runGit(cwd, "add", "--", "remote-change.txt");
  runGit(cwd, "commit", "-m", "chore: advance remote master");
  const remoteMasterSha = runGit(cwd, "rev-parse", "HEAD");
  runGit(cwd, "push", "origin", "HEAD:refs/heads/master");
  runGit(cwd, "switch", "codex/source");
  runGit(cwd, "fetch", "origin", "master");

  const savedSha = runGit(cwd, "rev-parse", "origin/master");
  assert.notEqual(savedSha, startingSha);
  assert.equal(savedSha, remoteMasterSha);
  runGit(cwd, "switch", "--detach", savedSha);
  assert.equal(runGit(cwd, "rev-parse", "HEAD"), savedSha);
  assert.equal(runGit(cwd, "rev-parse", "refs/heads/codex/source"), startingSha);

  await writeFile(join(cwd, "release.txt"), "release content\n");
  runGit(cwd, "add", "--", "release.txt");
  runGit(cwd, "commit", "-m", "chore: prepare release");
  assert.equal(runGit(cwd, "rev-parse", "HEAD^"), savedSha);
});

test("failed same-checkout transition preserves the branch, index, and user paths", async (t) => {
  const cwd = await createPrimaryCheckout(t);
  const startingSha = runGit(cwd, "rev-parse", "HEAD");
  runGit(cwd, "switch", "-c", "codex/source");
  runGit(cwd, "switch", "master");
  await writeFile(join(cwd, "tracked.txt"), "master change\n");
  await writeFile(join(cwd, "target-file.txt"), "master file\n");
  runGit(cwd, "add", "--", "tracked.txt", "target-file.txt");
  runGit(cwd, "commit", "-m", "chore: advance release base");
  const savedSha = runGit(cwd, "rev-parse", "HEAD");
  runGit(cwd, "switch", "codex/source");
  await writeFile(join(cwd, "staged-release.txt"), "staged release\n");
  runGit(cwd, "add", "--", "staged-release.txt");
  await writeFile(join(cwd, "tracked.txt"), "pending release\n");
  await writeFile(join(cwd, "target-file.txt"), "untracked user file\n");
  const pendingStatus = runGit(cwd, "status", "--porcelain=v1", "--untracked-files=all");

  const transition = git(cwd, ["switch", "--detach", savedSha]);
  assert.notEqual(transition.status, 0);
  assert.equal(runGit(cwd, "rev-parse", "HEAD"), startingSha);
  assert.equal(runGit(cwd, "rev-parse", "refs/heads/codex/source"), startingSha);
  assert.equal(runGit(cwd, "status", "--porcelain=v1", "--untracked-files=all"), pendingStatus);
  assert.equal(await readFile(join(cwd, "staged-release.txt"), "utf8"), "staged release\n");
  assert.equal(await readFile(join(cwd, "tracked.txt"), "utf8"), "pending release\n");
  assert.equal(await readFile(join(cwd, "target-file.txt"), "utf8"), "untracked user file\n");
});

test("saved force-with-lease rejects a remote master advance and retains the release commit", async (t) => {
  const cwd = await createPrimaryCheckout(t);
  const remote = join(cwd, ".git", "local-origin.git");
  runGit(cwd, "init", "--bare", remote);
  runGit(cwd, "remote", "add", "origin", remote);
  runGit(cwd, "push", "-u", "origin", "master");
  const savedSha = runGit(cwd, "rev-parse", "HEAD");

  runGit(cwd, "switch", "--detach", savedSha);
  await writeFile(join(cwd, "release.txt"), "release content\n");
  runGit(cwd, "add", "--", "release.txt");
  runGit(cwd, "commit", "-m", "chore: prepare release");
  const releaseSha = runGit(cwd, "rev-parse", "HEAD");

  runGit(cwd, "switch", "-c", "codex/remote-advance", savedSha);
  await writeFile(join(cwd, "remote-change.txt"), "new master content\n");
  runGit(cwd, "add", "--", "remote-change.txt");
  runGit(cwd, "commit", "-m", "chore: advance master");
  const advancedSha = runGit(cwd, "rev-parse", "HEAD");
  runGit(cwd, "push", "origin", "HEAD:refs/heads/master");
  runGit(cwd, "switch", "--detach", releaseSha);

  const push = git(cwd, [
    "push",
    `--force-with-lease=refs/heads/master:${savedSha}`,
    "origin",
    "HEAD:refs/heads/master",
  ]);
  assert.notEqual(push.status, 0);
  assert.equal(runGit(cwd, "--git-dir", remote, "rev-parse", "refs/heads/master"), advancedSha);
  assert.equal(runGit(cwd, "rev-parse", "HEAD"), releaseSha);
  assert.equal(runGit(cwd, "rev-parse", "HEAD^"), savedSha);
});
