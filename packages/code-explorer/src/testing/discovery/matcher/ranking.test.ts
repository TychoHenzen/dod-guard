import assert from "node:assert/strict";
import { it } from "node:test";
import { matchDiscoveryCandidates } from "../../../discovery/matcher.js";
import { symbol } from "./symbol-fixture.js";

it(
  "uses stable path, kind, and identity keys independently " +
    "of collection order",
  () => {
    const candidates = rankingCandidates();
    const expected = ["function", "method", "zeta"];

    assert.deepEqual(
      matchDiscoveryCandidates("helper", candidates).map(
        (result) => result.identity,
      ),
      expected,
    );
    assert.deepEqual(
      matchDiscoveryCandidates("helper", [...candidates].reverse()).map(
        (result) => result.identity,
      ),
      expected,
    );
    assert.deepEqual(
      matchDiscoveryCandidates("helper", candidates).map((result) => result),
      matchDiscoveryCandidates("helper", candidates).map((result) => result),
    );
  },
);
it(
  "orders equal-match candidates by their stable path, " +
    "kind, and identity keys",
  () => {
    const candidates = rankingCandidates();
    assert.deepEqual(
      matchDiscoveryCandidates("helper", candidates).map(
        (result) => result.identity,
      ),
      ["function", "method", "zeta"],
    );
  },
);

function rankingCandidates() {
  return [
    symbol("helper", "src/zeta.ts", { identity: "zeta", kind: "method" }),
    symbol("helper", "src/alpha.ts", { identity: "method", kind: "method" }),
    symbol("helper", "src/alpha.ts", {
      identity: "function",
      kind: "function",
    }),
  ];
}
