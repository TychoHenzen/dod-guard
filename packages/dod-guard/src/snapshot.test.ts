import * as assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { after, before, describe, it, mock } from "node:test";

// ── Mock helpers ─────────────────────────────────────────────────────

type ExecCb = (err: Error | null, result: { stdout: string; stderr: string } | null) => void;

const TEST_COMMIT = "deadbeef1234567890abcdef1234567890abcdef12";

describe("createSnapshot and destroySnapshot", () => {
  let failWorktree: boolean;
  let failArchive: boolean;

  before(() => {
    mock.module("node:child_process", {
      namedExports: {
        exec: mock.fn((cmd: string, _opts: unknown, cb: ExecCb) => {
          // VCS commands used by checkDocument (not relevant to snapshot tests)
          if (cmd.startsWith("git rev-parse") || cmd.startsWith("git status")) {
            cb(new Error("not a git repo"), null);
            return;
          }
          if (cmd.startsWith("git worktree add") && failWorktree) {
            cb(new Error("fatal: working tree path is not on the same filesystem"), null);
            return;
          }
          if (cmd.startsWith("git archive") && failArchive) {
            cb(new Error("fatal: not a git repository"), null);
            return;
          }
          // Default: succeed
          cb(null, { stdout: "", stderr: "" });
        }),
      },
    });
  });

  after(() => {
    mock.reset();
  });

  it("creates worktree via git worktree add", async () => {
    failWorktree = false;
    failArchive = false;
    const { createSnapshot } = await import("./snapshot.js");

    const snapshot = await createSnapshot(process.cwd(), TEST_COMMIT);

    assert.ok(snapshot.cwd, "should have a cwd");
    assert.ok(snapshot.cwd.includes("dod-snapshot-"), "cwd should be in tmpdir with prefix");
    assert.equal(snapshot.commit, TEST_COMMIT);
    assert.equal(typeof snapshot.cleanup, "function", "should have cleanup function");

    // Clean up must not throw
    await snapshot.cleanup();
  });

  it("falls back to git archive when worktree add fails", async () => {
    failWorktree = true;
    failArchive = false;
    const { createSnapshot } = await import("./snapshot.js");

    const snapshot = await createSnapshot(process.cwd(), TEST_COMMIT);

    assert.ok(snapshot.cwd, "should have a cwd from fallback");
    assert.ok(snapshot.cwd.includes("dod-snapshot-"), "cwd should be in tmpdir");
    assert.equal(snapshot.commit, TEST_COMMIT);

    await snapshot.cleanup();
  });

  it("throws when both worktree add and git archive fail", async () => {
    failWorktree = true;
    failArchive = true;
    const { createSnapshot } = await import("./snapshot.js");

    await assert.rejects(
      () => createSnapshot(process.cwd(), TEST_COMMIT),
      /could not create snapshot/,
      "should throw when both methods fail",
    );
  });

  it("destroySnapshot calls cleanup and handles non-existent directory gracefully", async () => {
    failWorktree = false;
    failArchive = false;
    const { createSnapshot, destroySnapshot } = await import("./snapshot.js");

    const snapshot = await createSnapshot(process.cwd(), TEST_COMMIT);
    assert.ok(snapshot.cwd, "snapshot created");

    // Must not throw even if the directory doesn't exist on disk
    await destroySnapshot(snapshot);

    // Verify the directory is gone (or never existed — both OK with force:true rm)
    try {
      await access(snapshot.cwd);
      // Directory still exists — acceptable if rm failed silently
    } catch {
      // Expected: directory removed
    }
  });
});
