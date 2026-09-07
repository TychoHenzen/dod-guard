import assert from "node:assert/strict";
import { it } from "node:test";
import {
  groupLandmarks,
  readyGroupedLandmarks,
} from "../../../discovery/landmarks.js";
import { candidate } from "./candidate-fixture.js";

it(
  "assigns each eligible landmark to its one declared " +
    "group with identity and evidence",
  () => {
    const discovery = readyGroupedLandmarks([
      candidate("Order", "type"),
      candidate("OrderEvent", "class"),
      candidate("OrderService", "interface"),
      candidate("main", "function"),
      candidate("archiveOrder", "method"),
    ]);

    assert.deepEqual(
      discovery.landmarks.map(({ group }) => group),
      [
        "messages_or_events",
        "services",
        "entry_points",
        "types",
        "common_actions",
      ],
    );
    for (const group of discovery.landmarks) {
      assert.equal(group.omitted_candidate_count, 0);
      assert.equal(group.symbols.length, 1);
      const [landmark] = group.symbols;
      assert.ok(landmark?.symbol_id);
      assert.ok(landmark?.path);
      assert.ok(landmark?.kind);
      assert.ok("evidence" in (landmark ?? {}));
    }
  },
);
it("bounds each group and reports its " + "omitted candidate count", () => {
  const groups = groupLandmarks(
    [
      candidate("first", "function"),
      candidate("second", "function"),
      candidate("third", "function"),
    ],
    2,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.group, "common_actions");
  assert.deepEqual(
    groups[0]?.candidates.map((candidate) => candidate.symbol_id),
    ["first", "second"],
  );
  assert.equal(groups[0]?.omitted_candidate_count, 1);
  assert.equal(groups[0]?.candidates.length, 2);
  assert.throws(() => groupLandmarks([], 51), /landmark_group_limit_exceeded/);
});
