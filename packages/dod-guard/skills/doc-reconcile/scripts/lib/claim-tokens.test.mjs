import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { claimTokens, contentDigest, normalizeClaim } from "./claim-tokens.mjs";

describe("claimTokens", () => {
  it("removes stopwords", () => {
    const tokens = claimTokens("The build script runs the tests");
    assert.deepEqual(tokens, ["build", "script", "runs", "tests"]);
  });

  it("keeps a code span as one token", () => {
    const tokens = claimTokens("Run `dod_check` first");
    assert.deepEqual(tokens, ["run", "dod_check", "first"]);
  });

  it("keeps a file path as one token", () => {
    const tokens = claimTokens("Docs live at packages/dod-guard/dist/bundle.js today");
    assert.deepEqual(tokens, ["docs", "live", "packages/dod-guard/dist/bundle.js", "today"]);
  });

  it("keeps a CLI flag as one token", () => {
    const tokens = claimTokens("Pass --root=. to scope the run");
    assert.deepEqual(tokens, ["pass", "--root=.", "scope", "run"]);
  });

  it("keeps pure numbers as tokens", () => {
    const tokens = claimTokens("The gate needs 3 servers not 5");
    assert.deepEqual(tokens, ["gate", "needs", "3", "servers", "5"]);
  });

  it("reduces a markdown link to its link text", () => {
    const tokens = claimTokens("See the [style guide](https://example.com/style) first");
    assert.deepEqual(tokens, ["see", "style", "guide", "first"]);
  });

  it("keeps the dot in bundle.js at the end of a sentence", () => {
    const tokens = claimTokens("The bundle lives at bundle.js.");
    assert.deepEqual(tokens, ["bundle", "lives", "bundle.js"]);
  });
  it("keeps a decimal number as one token", () => {
    const tokens = claimTokens("The version is 1.5 now");
    assert.deepEqual(tokens, ["version", "1.5", "now"]);
  });
  it("keeps a trailing --root=. flag value at end of sentence", () => {
    const tokens = claimTokens("Scope the run with --root=.");
    assert.deepEqual(tokens, ["scope", "run", "--root=."]);
  });
});

describe("contentDigest", () => {
  it("is stable across a rewrap", () => {
    const wrapped = "The build script writes the\nbundle to dist before it runs the tests.";
    const oneLine = "The build script writes the bundle to dist before it runs the tests.";
    assert.equal(contentDigest(wrapped), contentDigest(oneLine));
  });

  it("is stable across a case change", () => {
    const lower = "the build script runs the tests";
    const upper = "THE BUILD SCRIPT RUNS THE TESTS";
    assert.equal(contentDigest(lower), contentDigest(upper));
  });

  it("is stable across a punctuation-only change", () => {
    const bare = "Build the project then run the tests";
    const punctuated = "Build the project, then run the tests.";
    assert.equal(contentDigest(bare), contentDigest(punctuated));
  });

  it("is stable across a list-marker change from dash to star", () => {
    const dash = "- Run the build before every release";
    const star = "* Run the build before every release";
    assert.equal(contentDigest(dash), contentDigest(star));
  });
  it("changes when one word changes", () => {
    const before = "The build script runs the tests";
    const after = "The build script skips the tests";
    assert.notEqual(contentDigest(before), contentDigest(after));
  });
  it("is stable for a path with a trailing period", () => {
    const dot = "Docs live at packages/dod-guard/dist/bundle.js.";
    const bare = "Docs live at packages/dod-guard/dist/bundle.js";
    assert.equal(contentDigest(dot), contentDigest(bare));
  });
  it("is stable for a code span with a trailing comma", () => {
    const comma = "Ships `/interview`, /ratchet.";
    const bare = "ships /interview /ratchet";
    assert.equal(contentDigest(comma), contentDigest(bare));
  });
});

describe("normalizeClaim", () => {
  it("collapses whitespace runs and trims", () => {
    assert.equal(normalizeClaim("  Build   the   project  "), "build the project");
  });

  it("strips a heading hash prefix", () => {
    assert.equal(normalizeClaim("## Build Steps"), "build steps");
  });
});
