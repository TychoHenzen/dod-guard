import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  declarations,
  ngrams,
  removeTokenRuns,
  significantLines,
  tokenize,
} from "./text-tokens.mjs";

describe("tokenize", () => {
  it("splits identifiers, numbers and punctuation", () => {
    const expected = ["total", "=", "41", "+", "1", ";"];
    assert.deepEqual(tokenize("total = 41 + 1;"), expected);
  });

  it("drops line and block comments", () => {
    const source = "a; // trailing note\n/* block */ b;";
    assert.deepEqual(tokenize(source), ["a", ";", "b", ";"]);
  });

  it("removes whitelisted boundary tokens", () => {
    const actual = tokenize("findPath(grid);", ["findPath", "grid"]);
    assert.deepEqual(actual, ["(", ")", ";"]);
  });
});

describe("ngrams", () => {
  it("produces one window per starting position", () => {
    const actual = ngrams(["a", "b", "c", "d", "e"], 4);
    assert.deepEqual(actual, ["a b c d", "b c d e"]);
  });

  it("returns nothing when the run is shorter than the window", () => {
    assert.deepEqual(ngrams(["a", "b"], 4), []);
  });
});

describe("significantLines", () => {
  it("drops short lines and brace-only lines", () => {
    const text = "function widen(value) {\n}\nx;\n  return value + 1;\n";
    const expected = ["function widen(value) {", "return value + 1;"];
    assert.deepEqual(significantLines(text), expected);
  });

  it("drops lines that mention a whitelisted boundary token", () => {
    const text = "export function findPath(grid) {\n  return walk(grid);\n";
    assert.deepEqual(significantLines(text, ["findPath"]), ["return walk(grid);"]);
  });

  it("treats a whitelist entry as a whole word", () => {
    const text = "const findPathCache = new Map();\n";
    assert.deepEqual(significantLines(text, ["findPath"]).length, 1);
  });
});

describe("declarations", () => {
  it("collects declared names in source order", () => {
    const text = "function open(){}\nconst reader = 1;\nclass Frame {}\n";
    assert.deepEqual(declarations(text), ["open", "reader", "Frame"]);
  });

  it("omits whitelisted names", () => {
    const text = "function findPath(){}\nconst helper = 1;\n";
    assert.deepEqual(declarations(text, ["findPath"]), ["helper"]);
  });
});

describe("removeTokenRuns", () => {
  it("removes every occurrence of a run, not just the first", () => {
    const tokens = ["a", "b", "c", "x", "a", "b", "c", "y", "a", "b", "c"];
    const actual = removeTokenRuns(tokens, [["a", "b", "c"]]);
    assert.deepEqual(actual, ["x", "y"]);
  });

  it("removes the longer of two overlapping runs first", () => {
    // "a b" alone would eat the middle of "a b c" if tried first. That
    // leaves a stray "c" instead of removing the whole three-token run.
    const tokens = ["a", "b", "c", "z"];
    const actual = removeTokenRuns(tokens, [
      ["a", "b", "c"],
      ["a", "b"],
    ]);
    assert.deepEqual(actual, ["z"]);
  });
});
