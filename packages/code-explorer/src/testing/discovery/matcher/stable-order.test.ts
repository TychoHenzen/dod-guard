import assert from "node:assert/strict";
import { it } from "node:test";
import { matchDiscoveryCandidates } from "../../../discovery/matcher.js";
import { symbol } from "./symbol-fixture.js";

it(
  "sorts all match evidence deterministically by class, " +
    "score, path, kind, and identity",
  () => {
    const candidates = [
      symbol("fo", "src/z.ts", { identity: "z", kind: "variable" }),
      symbol("fo", "src/a.ts", { identity: "b", kind: "method" }),
      symbol("fo", "src/a.ts", { identity: "a", kind: "method" }),
      symbol("foobar", "src/prefix.ts", { identity: "prefix" }),
      symbol("fao", "src/fuzzy.ts", { identity: "fuzzy" }),
    ];
    const expected = ["a", "b", "z", "prefix", "fuzzy"];

    assert.deepEqual(
      matchDiscoveryCandidates("fo", candidates).map(
        ({ identity }) => identity,
      ),
      expected,
    );
    assert.deepEqual(
      matchDiscoveryCandidates("fo", candidates).map(
        ({ identity }) => identity,
      ),
      expected,
    );
  },
);
it(
  "uses exact code points to break normalized-identity " +
    "ties independently of input order",
  () => {
    const caseVariants = [
      symbol("foo", "src/same.ts", { identity: "a" }),
      symbol("foo", "src/same.ts", { identity: "A" }),
    ];
    const compatibilityVariants = [
      symbol("foo", "src/same.ts", { identity: "\uFF21" }),
      symbol("foo", "src/same.ts", { identity: "A" }),
    ];

    assert.deepEqual(
      matchDiscoveryCandidates("foo", caseVariants).map(
        ({ identity }) => identity,
      ),
      ["A", "a"],
    );
    assert.deepEqual(
      matchDiscoveryCandidates("foo", [...caseVariants].reverse()).map(
        ({ identity }) => identity,
      ),
      ["A", "a"],
    );
    assert.deepEqual(
      matchDiscoveryCandidates("foo", compatibilityVariants).map(
        ({ identity }) => identity,
      ),
      ["A", "\uFF21"],
    );
    assert.deepEqual(
      matchDiscoveryCandidates("foo", [...compatibilityVariants].reverse()).map(
        ({ identity }) => identity,
      ),
      ["A", "\uFF21"],
    );
  },
);
it("treats whitespace-only queries as empty " + "discovery queries", () => {
  assert.deepEqual(
    matchDiscoveryCandidates(" \u00a0", [
      symbol("anything", "src/anything.ts"),
    ]),
    [],
  );
});
