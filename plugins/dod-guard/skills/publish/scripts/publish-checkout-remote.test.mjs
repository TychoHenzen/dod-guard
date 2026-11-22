import assert from "node:assert/strict";
import { test } from "node:test";
import { commitFile, createOriginCheckout, git, runGit } from "./harness/primary-checkout.mjs";

test("same-checkout release uses the fetched origin master SHA as its parent", async (t) => {
  const { cwd } = await createOriginCheckout(t);
  const startingSha = runGit(cwd, "rev-parse", "HEAD");

  runGit(cwd, "switch", "-c", "codex/source");
  runGit(cwd, "switch", "-c", "codex/remote-master-advance", startingSha);
  await commitFile(
    cwd,
    { name: "remote-change.txt", content: "remote master content\n" },
    "chore: advance remote master",
  );
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

  await commitFile(cwd, { name: "release.txt", content: "release content\n" }, "chore: prepare release");
  assert.equal(runGit(cwd, "rev-parse", "HEAD^"), savedSha);
});

test("saved force-with-lease rejects a remote master advance and retains the release commit", async (t) => {
  const { cwd, remote } = await createOriginCheckout(t);
  const savedSha = runGit(cwd, "rev-parse", "HEAD");

  runGit(cwd, "switch", "--detach", savedSha);
  await commitFile(cwd, { name: "release.txt", content: "release content\n" }, "chore: prepare release");
  const releaseSha = runGit(cwd, "rev-parse", "HEAD");

  runGit(cwd, "switch", "-c", "codex/remote-advance", savedSha);
  await commitFile(cwd, { name: "remote-change.txt", content: "new master content\n" }, "chore: advance master");
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
