import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";
import { createPerformanceFixture } from "./performance.js";

const execFileAsync = promisify(execFile);

test(
  "points HEAD at the fast-import branch for small " + "real fixtures",
  async () => {
    const fixture = await createPerformanceFixture({
      commitCount: 10,
      fileCount: 3,
    });
    try {
      const commits = await execFileAsync(
        "git",
        ["rev-list", "--count", "HEAD"],
        { cwd: fixture.root },
      );
      const files = await execFileAsync(
        "git",
        ["ls-tree", "-r", "-z", "--name-only", "HEAD"],
        { cwd: fixture.root },
      );

      assert.equal(commits.stdout.trim(), "10");
      assert.equal(files.stdout.split("\0").filter(Boolean).length, 3);
    } finally {
      await fixture.cleanup();
    }
  },
);
