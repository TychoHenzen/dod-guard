import assert from "node:assert/strict";
import { it } from "node:test";
import { matchDiscoveryCandidates } from "../../../discovery/matcher.js";
import { symbol } from "./symbol-fixture.js";

it(
  "normalizes Unicode compatibility forms and returns " +
    "exact before prefix and fuzzy evidence",
  () => {
    const results = matchDiscoveryCandidates("ＦＯＯ", [
      symbol("Foobar", "src/prefix.ts", { identity: "prefix" }),
      symbol("Fob", "src/fuzzy.ts", { identity: "fuzzy" }),
      symbol("foo", "src/exact.ts", { identity: "exact" }),
    ]);

    assert.deepEqual(
      results.map(({ identity, match_class, match_score }) => [
        identity,
        match_class,
        match_score,
      ]),
      [
        ["exact", "exact", 100],
        ["prefix", "prefix", 50],
        ["fuzzy", "fuzzy", 67],
      ],
    );
  },
);
it("reports a close misspelling as scored " + "fuzzy evidence", () => {
  const [result] = matchDiscoveryCandidates("helpr", [
    symbol("helper", "src/helper.ts", { identity: "helper" }),
  ]);

  assert.deepEqual(result, {
    type: "symbol",
    name: "helper",
    path: "src/helper.ts",
    kind: "function",
    identity: "helper",
    match_class: "fuzzy",
    match_score: 83,
  });
});
it(
  "uses Unicode code points, including supplementary " +
    "characters, for fuzzy evidence",
  () => {
    const [result] = matchDiscoveryCandidates("a😀c", [
      symbol("a😀b", "src/emoji.ts"),
    ]);
    assert.equal(result?.match_class, "fuzzy");
    assert.equal(result?.match_score, 67);
  },
);
