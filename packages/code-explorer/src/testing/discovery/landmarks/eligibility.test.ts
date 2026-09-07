import assert from "node:assert/strict";
import { it } from "node:test";
import {
  defaultLandmarks,
  groupLandmarks,
} from "../../../discovery/landmarks.js";
import { candidate } from "./candidate-fixture.js";

it(
  "keeps a related message and service symbol in their " +
    "separate literal suffix groups",
  () => {
    const groups = groupLandmarks([
      candidate("OrderEvent", "type"),
      candidate("OrderService", "type"),
    ]);
    assert.deepEqual(
      groups.map(({ group, candidates }) => ({
        group,
        identities: candidates.map((candidate) => candidate.symbol_id),
      })),
      [
        { group: "messages_or_events", identities: ["OrderEvent"] },
        { group: "services", identities: ["OrderService"] },
      ],
    );
  },
);
it(
  "does not select a frequently named generic identifier " +
    "without supported evidence",
  () => {
    const landmarks = defaultLandmarks([
      {
        symbol: {
          symbol_id: "value",
          name: "value",
          path: "src/value.ts",
          kind: "function",
        },
        references: [],
      },
      candidate("UsefulService", "type"),
    ]);

    assert.deepEqual(
      landmarks.map(({ symbol_id }) => symbol_id),
      ["UsefulService"],
    );
  },
);
