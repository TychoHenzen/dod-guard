import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inspectWorkspaceFileMetadataWithWarnings,
  oldUntrackedWorkspaceCandidates,
} from "./workspace-debris.js";

test(
  "warns for an unreadable discovered path and continues without creating " +
    "candidate metadata",
  () => {
    const metadataReads: string[] = [];
    const result = inspectWorkspaceFileMetadataWithWarnings(
      ["scratch/unreadable.ts", "scratch/later.ts"],
      (path) => {
        metadataReads.push(path);
        if (path === "scratch/unreadable.ts")
          throw new Error("sensitive filesystem failure");
        return { path, isRegularFile: true, modifiedTimestampMs: 0 };
      },
    );

    assert.deepEqual(metadataReads, [
      "scratch/unreadable.ts",
      "scratch/later.ts",
    ]);
    assert.deepEqual(result.metadata, [
      { path: "scratch/later.ts", isRegularFile: true, modifiedTimestampMs: 0 },
    ]);
    assert.deepEqual(result.warnings, [
      {
        code: "workspace_unreadable",
        message: "Workspace path could not be inspected.",
        path: "scratch/unreadable.ts",
      },
    ]);
    assert.equal(
      JSON.stringify(result.warnings).includes("sensitive filesystem failure"),
      false,
    );
    assert.deepEqual(
      oldUntrackedWorkspaceCandidates(
        result.metadata,
        10 * 24 * 60 * 60 * 1_000,
        7,
      ),
      [{ path: "scratch/later.ts", kind: "untracked", modifiedTimestampMs: 0 }],
    );

    const sortedWarnings = inspectWorkspaceFileMetadataWithWarnings(
      ["scratch/zeta.ts", "scratch/alpha.ts"],
      () => {
        throw new Error("sensitive filesystem failure");
      },
    );
    assert.deepEqual(
      sortedWarnings.warnings.map(({ path }) => path),
      ["scratch/alpha.ts", "scratch/zeta.ts"],
    );
  },
);
