import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { createPrimaryCheckout, git, runGit } from "./harness/primary-checkout.mjs";

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
