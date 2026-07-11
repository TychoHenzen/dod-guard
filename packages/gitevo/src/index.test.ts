import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { wrap } from "./index.js";
import { EvoError } from "./operations.js";

describe("wrap", () => {
  it("returns the wrapped function's result on success", () => {
    const fn = () => "success!";
    const wrapped = wrap(fn);
    assert.equal(wrapped(), "success!");
  });

  it("returns ERROR: prefix on EvoError", () => {
    const fn = () => {
      throw new EvoError("init not run");
    };
    const wrapped = wrap(fn);
    assert.ok(wrapped().startsWith("ERROR: "));
    assert.match(wrapped(), /init not run/);
  });

  it("returns ERROR: prefix on generic Error", () => {
    const fn = () => {
      throw new Error("generic failure");
    };
    const wrapped = wrap(fn);
    assert.ok(wrapped().startsWith("ERROR: "));
    assert.match(wrapped(), /generic failure/);
  });

  it("returns ERROR: prefix on non-Error throw", () => {
    const fn = () => {
      throw "string error";
    };
    const wrapped = wrap(fn);
    assert.ok(wrapped().startsWith("ERROR: "));
    assert.match(wrapped(), /string error/);
  });

  it("passes arguments through to wrapped function", () => {
    const fn = (a: number, b: number) => `${a + b}`;
    const wrapped = wrap(fn);
    assert.equal(wrapped(3, 4), "7");
  });
});

describe("EvoError", () => {
  it("is instance of Error", () => {
    const e = new EvoError("test");
    assert.ok(e instanceof Error);
  });

  it("is instance of EvoError", () => {
    const e = new EvoError("test");
    assert.ok(e instanceof EvoError);
  });

  it("has correct message", () => {
    const e = new EvoError("something went wrong");
    assert.equal(e.message, "something went wrong");
  });
});
