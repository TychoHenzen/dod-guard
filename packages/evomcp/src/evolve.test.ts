import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { matchSimple } from "./evolve.js";

describe("matchSimple", () => {
  it("exact match returns true", () => {
    assert.equal(matchSimple("foo.ts", "foo.ts"), true);
  });

  it("mismatch returns false", () => {
    assert.equal(matchSimple("foo.ts", "bar.ts"), false);
  });

  it("wildcard * matches any chars", () => {
    assert.equal(matchSimple("foo.ts", "*.ts"), true);
    assert.equal(matchSimple("foo.js", "*.ts"), false);
  });

  it("wildcard * matches zero chars", () => {
    assert.equal(matchSimple(".ts", "*.ts"), true);
  });

  it("escapes literal dots in pattern", () => {
    assert.equal(matchSimple("fooXts", "foo.ts"), false);
    assert.equal(matchSimple("foo.ts", "foo.ts"), true);
  });

  it("multiple wildcards", () => {
    assert.equal(matchSimple("foo.bar.ts", "*.*.ts"), true);
    assert.equal(matchSimple("foo.ts", "*.*.ts"), false);
  });

  it("wildcard at start", () => {
    assert.equal(matchSimple("index.ts", "*.ts"), true);
    assert.equal(matchSimple("index.test.ts", "*.test.ts"), true);
    assert.equal(matchSimple("index.ts", "*.test.ts"), false);
  });
});

describe("evolve - error paths", () => {
  it("throws when fitness_cmd returns no numeric score", async () => {
    const { evolve } = await import("./evolve.js");
    const spec = {
      goal: "test",
      fitness_cmd: "echo no number here",
      cwd: process.cwd(),
      target_files: ["package.json"],
    };
    await assert.rejects(() => evolve(spec), /did not emit a numeric score/);
  });

  it("throws when no target files match", async () => {
    const { evolve } = await import("./evolve.js");
    const spec = {
      goal: "test",
      fitness_cmd: "echo 42",
      cwd: process.cwd(),
      target_files: ["nonexistent_*.zzz"],
    };
    await assert.rejects(() => evolve(spec), /No target files found/);
  });
});
