import assert from "node:assert/strict";
import { it } from "node:test";
import { matchDiscoveryCandidates } from "../../../discovery/matcher.js";
import { symbol } from "./symbol-fixture.js";

it(
  "uses unrestricted Damerau-Levenshtein for repeated " + "transpositions",
  () => {
    const [result] = matchDiscoveryCandidates("xxxCAyyy", [
      symbol("xxxABCyyy", "src/transposed.ts"),
    ]);
    assert.equal(result?.match_class, "fuzzy");
    assert.equal(result?.match_score, 78);
  },
);
