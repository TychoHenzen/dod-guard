import assert from "node:assert/strict";
import test from "node:test";

import { parseNameStatus } from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-paths.mjs";

test("a deleted file maps to itself so its findings count as removed", () => {
  assert.deepEqual(parseNameStatus("D\tsrc/gone.cs\n"), [
    { path: "src/gone.cs", basePath: "src/gone.cs" },
  ]);
});
