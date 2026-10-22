import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { renderCompletionRecord } from "../../complete-pr/scripts/lib/closure-records.mjs";
import { issue, item, REPOSITORY, snapshot } from "./select-next.test-support.mjs";
import { withSnapshotFile } from "./snapshot-file.test-support.mjs";

const CLOSURE = fileURLToPath(new URL("../../complete-pr/scripts/closure.mjs", import.meta.url));
const HEAD_831 = "e783f4269c5627f4ad10efdb97dfc12a9918da83";

const MERGE_831 = "8f7b04b0c735453e1487ca1fd0b7a308ccb39fee";
const PULL_836 = { number: 836, repository: REPOSITORY };

function mergedPull836() {
  return {
    ...PULL_836,
    state: "closed",
    mergedAt: "2026-10-08T21:59:22Z",
    head: { repository: REPOSITORY, ref: "codex/831-route-goal-sdlc-stages", sha: HEAD_831 },
    base: { ref: "master", sha: "base-831" },
    mergeCommit: { oid: MERGE_831 },
    requiredChecks: [{ name: "build-test", bucket: "pass" }],
  };
}

// #831 (PR #836) with child #832, as /complete-pr leaves it: both closed and
// Done, each carrying the completion record, and the snapshot itself carrying
// no activeCheckpoint or trustedHeadSha.
export function recordedDelivery(pendingRows = []) {
  const record = renderCompletionRecord({
    pullRequest: 836,
    mergeCommit: MERGE_831,
    trustedHeadSha: HEAD_831,
    requiredChecks: "pass",
    pendingRows,
  });
  const parent = { repository: REPOSITORY, number: 831 };
  const input = snapshot();
  input.items.push(
    item(831, "Done", { linked: [PULL_836] }),
    item(832, "Done", { parentIssue: parent, linked: [PULL_836] }),
  );
  input.issues.push(
    issue(831, {
      state: "closed",
      children: [{ repository: REPOSITORY, number: 832 }],
      comments: [{ id: 1, body: record }],
    }),
    issue(832, { state: "closed", parent, comments: [{ id: 2, body: record }] }),
  );
  input.pullRequests.push(mergedPull836());
  return input;
}

export function annotated(input) {
  return withSnapshotFile("annotate-", input, (file) => {
    const run = spawnSync(process.execPath, [CLOSURE, "annotate", `--snapshot=${file}`], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout);
  });
}
