// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertPatchCount } from "./fixtures/project-status-calls.mjs";
import { ITEM_IDS } from "./fixtures/project-status-data.mjs";
import { numericIdOf, writeItems } from "./fixtures/project-status-write.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

const NO_STATUS_READBACK = /Status field\/value/;

// An item added to the Project moments ago has a Status field whose value is null until its first write.
function unsetRunner() {
  return createRunner({ statuses: new Map([[ITEM_IDS[0], null]]) });
}

test("#1241 an item with no Status yet gets its first write, by numeric or node id", () => {
  for (const itemId of [numericIdOf(0), ITEM_IDS[0]]) {
    const { calls, runner } = unsetRunner();

    const result = writeItems([itemId], runner);

    assertPatchCount(calls, 1);
    assert.deepEqual(result.mutations, [{ itemId, status: "Done", changed: true }]);
  }
});

test("#1241 a first write whose readback still shows no Status fails", () => {
  const { runner } = unsetRunner();
  let patches = 0;
  const patchIgnored = (args) => {
    if (!args.includes("PATCH")) {
      return runner(args);
    }
    patches += 1;
    return { status: 0, stderr: "", stdout: "" };
  };

  assert.throws(() => writeItems([numericIdOf(0)], patchIgnored), NO_STATUS_READBACK);
  assert.equal(patches, 1);
});
