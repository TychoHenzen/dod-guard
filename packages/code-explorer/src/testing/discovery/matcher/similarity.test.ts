import assert from "node:assert/strict";
import { it } from "node:test";
import { matchDiscoveryCandidates } from "../../../discovery/matcher.js";
import { symbol } from "./symbol-fixture.js";

it(
  "includes 60 percent similarity and rejects a score " + "below the threshold",
  () => {
    assert.equal(
      matchDiscoveryCandidates("abcde", [symbol("abxye", "src/included.ts")])[0]
        ?.match_score,
      60,
    );
    assert.deepEqual(
      matchDiscoveryCandidates("abcdefg", [symbol("abc", "src/rejected.ts")]),
      [],
    );
  },
);
it(
  "matches filename stems and extensions with a normalized " +
    "project-relative path",
  () => {
    const stem = matchDiscoveryCandidates("Demo", [
      { type: "file" as const, path: "src\\Demo.cs", identity: "stem" },
    ])[0];
    const extension = matchDiscoveryCandidates("demo.cs", [
      { type: "file" as const, path: "src/Demo.cs", identity: "extension" },
    ])[0];

    assert.deepEqual(stem, {
      type: "file",
      path: "src/Demo.cs",
      identity: "stem",
      match_class: "exact",
      match_score: 100,
    });
    assert.equal(extension?.match_class, "exact");
  },
);
