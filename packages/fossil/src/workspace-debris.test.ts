import assert from "node:assert/strict";
import { test } from "node:test";
import {
  oldUntrackedWorkspaceCandidates,
  parseNulDelimitedPaths,
  UNTRACKED_DISCOVERY_ARGUMENTS,
} from "./workspace-debris.js";

// covers: fossil/workspace-debris :: Workspace file discovery :: Old untracked file is eligible
test("parses NUL-delimited untracked paths and selects an old regular file", () => {
  const unusualPath = "scratch/line\nbreak.ts";
  assert.deepEqual(UNTRACKED_DISCOVERY_ARGUMENTS, ["ls-files", "-z", "--others", "--exclude-standard"]);
  assert.deepEqual(parseNulDelimitedPaths(`scratch/old.ts\0${unusualPath}\0`), ["scratch/old.ts", unusualPath]);

  const candidates = oldUntrackedWorkspaceCandidates(
    [
      { path: "scratch/old.ts", isRegularFile: true, modifiedTimestampMs: 0 },
      { path: "scratch/directory", isRegularFile: false, modifiedTimestampMs: 0 },
    ],
    10 * 24 * 60 * 60 * 1_000,
    7,
  );

  assert.deepEqual(candidates, [{ path: "scratch/old.ts", kind: "untracked", modifiedTimestampMs: 0 }]);
});
