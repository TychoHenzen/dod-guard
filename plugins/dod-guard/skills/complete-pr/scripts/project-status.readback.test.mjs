// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertPatchCount, isListRead } from "./fixtures/project-status-calls.mjs";
import { ITEM_IDS, ITEM_NUMERIC_IDS, projectItems } from "./fixtures/project-status-data.mjs";
import { recordingSleep } from "./fixtures/project-status-lag.mjs";
import { backlogRunner, writeFirst, writeItems, writeOptions } from "./fixtures/project-status-write.mjs";
import { writeProjectStatuses } from "./project-status.mjs";
import { createRunner } from "./project-status-fixtures.mjs";

const MISSING_READBACK_ERROR = /missing from readback/;
const MISSING_NUMERIC_ID = "999999999";

test("rejects malformed or partial initial readbacks before any PATCH", () => {
  const partialItem = { id: ITEM_NUMERIC_IDS.get(ITEM_IDS[0]), node_id: ITEM_IDS[0] };
  const replacements = [JSON.stringify({ items: [] }), JSON.stringify([[]]), JSON.stringify([[partialItem]])];
  for (const replacement of replacements) {
    const { calls, runner } = backlogRunner();
    const malformedRunner = (args) => {
      const result = runner(args);
      return isListRead(args) ? { ...result, stdout: replacement } : result;
    };

    assert.throws(() => writeFirst(malformedRunner), /Project item readback|Status field\/value|missing from readback/);
    assertPatchCount(calls, 0);
  }
});

test("rejects duplicate or missing Project item identities before any PATCH", () => {
  const [listed] = projectItems(new Map([[ITEM_IDS[0], "Done"]]));
  for (const items of [[listed, listed], [listed]]) {
    const { calls, runner } = createRunner({ statuses: new Map([[ITEM_IDS[0], "Done"]]) });
    const replacingRunner = (args) => {
      const base = runner(args);
      return isListRead(args) ? { ...base, stdout: JSON.stringify([items]) } : base;
    };

    assert.throws(
      () =>
        writeProjectStatuses({
          ...writeOptions({ itemIds: [ITEM_IDS[0], ITEM_IDS[1]] }),
          commandRunner: replacingRunner,
        }),
      /Project item|missing from readback|appeared more than once/,
    );
    assertPatchCount(calls, 0);
  }
});

test("AC-02 numeric ID matching no readback item stops as missing before any PATCH", () => {
  const { calls, runner } = createRunner();
  const { sleep } = recordingSleep();

  assert.throws(() => writeItems([MISSING_NUMERIC_ID], runner, sleep), MISSING_READBACK_ERROR);
  assertPatchCount(calls, 0);
});
