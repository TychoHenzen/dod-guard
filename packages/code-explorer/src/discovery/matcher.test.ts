import assert from "node:assert/strict";
import { it } from "node:test";
import { matchDiscoveryCandidates } from "./matcher.js";

const symbol = (name: string, path: string, identity = name, kind = "function") => ({
  type: "symbol" as const,
  name,
  path,
  kind,
  identity,
});

// covers: code-explorer/symbol-discovery :: Search accepts incomplete symbol and file names :: Exact symbol name exists
it("normalizes Unicode compatibility forms and returns exact before prefix and fuzzy evidence", () => {
  const results = matchDiscoveryCandidates("ＦＯＯ", [
    symbol("Foobar", "src/prefix.ts", "prefix"),
    symbol("Fob", "src/fuzzy.ts", "fuzzy"),
    symbol("foo", "src/exact.ts", "exact"),
  ]);

  assert.deepEqual(
    results.map(({ identity, match_class, match_score }) => [identity, match_class, match_score]),
    [
      ["exact", "exact", 100],
      ["prefix", "prefix", 50],
      ["fuzzy", "fuzzy", 67],
    ],
  );
});

// covers: code-explorer/symbol-discovery :: Search accepts incomplete symbol and file names :: Symbol name is misspelled
it("reports a close misspelling as scored fuzzy evidence", () => {
  const [result] = matchDiscoveryCandidates("helpr", [symbol("helper", "src/helper.ts", "helper")]);

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

it("uses Unicode code points, including supplementary characters, for fuzzy evidence", () => {
  const [result] = matchDiscoveryCandidates("a😀c", [symbol("a😀b", "src/emoji.ts")]);
  assert.equal(result?.match_class, "fuzzy");
  assert.equal(result?.match_score, 67);
});

it("uses unrestricted Damerau-Levenshtein for repeated transpositions", () => {
  const [result] = matchDiscoveryCandidates("xxxCAyyy", [symbol("xxxABCyyy", "src/transposed.ts")]);
  assert.equal(result?.match_class, "fuzzy");
  assert.equal(result?.match_score, 78);
});

// covers: code-explorer/symbol-discovery :: Search order is deterministic :: Search is repeated without project changes
it("uses stable path, kind, and identity keys independently of collection order", () => {
  const candidates = [
    symbol("helper", "src/zeta.ts", "zeta", "method"),
    symbol("helper", "src/alpha.ts", "method", "method"),
    symbol("helper", "src/alpha.ts", "function", "function"),
  ];
  const expected = ["function", "method", "zeta"];

  assert.deepEqual(
    matchDiscoveryCandidates("helper", candidates).map((result) => result.identity),
    expected,
  );
  assert.deepEqual(
    matchDiscoveryCandidates("helper", [...candidates].reverse()).map((result) => result.identity),
    expected,
  );
  assert.deepEqual(
    matchDiscoveryCandidates("helper", candidates).map((result) => result),
    matchDiscoveryCandidates("helper", candidates).map((result) => result),
  );
});

// covers: code-explorer/symbol-discovery :: Search order is deterministic :: Equal-rank candidates are returned
it("orders equal-match candidates by their stable path, kind, and identity keys", () => {
  const candidates = [
    symbol("helper", "src/zeta.ts", "zeta", "method"),
    symbol("helper", "src/alpha.ts", "method", "method"),
    symbol("helper", "src/alpha.ts", "function", "function"),
  ];
  assert.deepEqual(
    matchDiscoveryCandidates("helper", candidates).map((result) => result.identity),
    ["function", "method", "zeta"],
  );
});

it("includes 60 percent similarity and rejects a score below the threshold", () => {
  assert.equal(matchDiscoveryCandidates("abcde", [symbol("abxye", "src/included.ts")])[0]?.match_score, 60);
  assert.deepEqual(matchDiscoveryCandidates("abcdefg", [symbol("abc", "src/rejected.ts")]), []);
});

// covers: code-explorer/symbol-discovery :: Search accepts incomplete symbol and file names :: Query matches a filename
it("matches filename stems and extensions with a normalized project-relative path", () => {
  const stem = matchDiscoveryCandidates("Demo", [{ type: "file" as const, path: "src\\Demo.cs", identity: "stem" }])[0];
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
});

it("normalizes slash variants and dot segments without allowing path traversal", () => {
  const [result] = matchDiscoveryCandidates("demo", [
    { type: "file", path: "./src//nested/../Demo.cs", identity: "safe" },
  ]);
  assert.equal(result, undefined);

  const [normalized] = matchDiscoveryCandidates("demo", [
    { type: "file", path: "./src//./Demo.cs", identity: "normalized" },
  ]);
  assert.equal(normalized?.path, "src/Demo.cs");
  assert.deepEqual(
    matchDiscoveryCandidates("demo", [
      { type: "file", path: "/src/Demo.cs", identity: "posix-absolute" },
      { type: "file", path: "C:\\src\\Demo.cs", identity: "windows-absolute" },
      { type: "file", path: "src/../Demo.cs", identity: "traversal" },
    ]),
    [],
  );
});

it("rejects absolute, drive-relative, UNC, and URI-like backend paths", () => {
  assert.deepEqual(
    matchDiscoveryCandidates("demo", [
      { type: "file", path: "C:\\src\\Demo.cs", identity: "windows-absolute" },
      { type: "file", path: "C:Demo.cs", identity: "windows-drive-relative" },
      { type: "file", path: "\\\\server\\share\\Demo.cs", identity: "unc" },
      { type: "file", path: "file:///tmp/Demo.cs", identity: "file-uri" },
      { type: "file", path: "scheme:Demo.cs", identity: "scheme-like" },
    ]),
    [],
  );

  assert.equal(
    matchDiscoveryCandidates("demo", [{ type: "file", path: "src/Demo.cs", identity: "portable" }])[0]?.path,
    "src/Demo.cs",
  );
});

it("sorts all match evidence deterministically by class, score, path, kind, and identity", () => {
  const candidates = [
    symbol("fo", "src/z.ts", "z", "variable"),
    symbol("fo", "src/a.ts", "b", "method"),
    symbol("fo", "src/a.ts", "a", "method"),
    symbol("foobar", "src/prefix.ts", "prefix"),
    symbol("fao", "src/fuzzy.ts", "fuzzy"),
  ];
  const expected = ["a", "b", "z", "prefix", "fuzzy"];

  assert.deepEqual(
    matchDiscoveryCandidates("fo", candidates).map(({ identity }) => identity),
    expected,
  );
  assert.deepEqual(
    matchDiscoveryCandidates("fo", candidates).map(({ identity }) => identity),
    expected,
  );
});

it("uses exact code points to break normalized-identity ties independently of input order", () => {
  const caseVariants = [symbol("foo", "src/same.ts", "a"), symbol("foo", "src/same.ts", "A")];
  const compatibilityVariants = [symbol("foo", "src/same.ts", "\uFF21"), symbol("foo", "src/same.ts", "A")];

  assert.deepEqual(
    matchDiscoveryCandidates("foo", caseVariants).map(({ identity }) => identity),
    ["A", "a"],
  );
  assert.deepEqual(
    matchDiscoveryCandidates("foo", [...caseVariants].reverse()).map(({ identity }) => identity),
    ["A", "a"],
  );
  assert.deepEqual(
    matchDiscoveryCandidates("foo", compatibilityVariants).map(({ identity }) => identity),
    ["A", "\uFF21"],
  );
  assert.deepEqual(
    matchDiscoveryCandidates("foo", [...compatibilityVariants].reverse()).map(({ identity }) => identity),
    ["A", "\uFF21"],
  );
});

it("treats whitespace-only queries as empty discovery queries", () => {
  assert.deepEqual(matchDiscoveryCandidates(" \u00a0", [symbol("anything", "src/anything.ts")]), []);
});
