import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import test from "node:test";
import { withSnapshotFile } from "./snapshot-file.test-support.mjs";

const CALLBACK_FAILED = /callback failed/;
const BOOM_STDERR = /boom/;
const SNAPSHOT = { repository: "TychoHenzen/dod-guard", items: [], issues: [], pullRequests: [] };

test("the snapshot directory is removed after the command succeeds", async () => {
  let kept;
  await withSnapshotFile("snapshot-file-", SNAPSHOT, (file, directory) => {
    kept = directory;
    assert.ok(existsSync(file));
  });
  assert.equal(existsSync(kept), false);
});

test("the snapshot directory is removed after the callback throws", async () => {
  let failed;
  await assert.rejects(
    withSnapshotFile("snapshot-file-", SNAPSHOT, (_file, directory) => {
      failed = directory;
      throw new Error("callback failed");
    }),
    CALLBACK_FAILED,
  );
  assert.equal(existsSync(failed), false);
});

test("a command that exits non-zero reports its stderr and still removes the directory", async () => {
  let failed;
  await assert.rejects(
    withSnapshotFile("snapshot-file-", SNAPSHOT, (_file, directory) => {
      failed = directory;
      const run = spawnSync(process.execPath, ["-e", "process.stderr.write('boom'); process.exit(3)"], {
        encoding: "utf8",
      });
      assert.equal(run.status, 0, run.stderr);
    }),
    BOOM_STDERR,
  );
  assert.equal(existsSync(failed), false);
});
