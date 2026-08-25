import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkStub } from "./stub-check.js";

describe("checkStub", () => {
  it("passes a test with assertions", () => {
    const body = `
      const result = add(1, 2);
      assert.strictEqual(result, 3);
    `;
    const r = checkStub(body);
    assert.equal(r.pass, true);
    assert.equal(r.reasons.length, 0);
  });

  it("passes a test using expect", () => {
    const body = `
      const result = calculate();
      expect(result).toBe(42);
    `;
    const r = checkStub(body);
    assert.equal(r.pass, true);
  });

  it("rejects an empty body", () => {
    const r = checkStub("");
    assert.equal(r.pass, false);
    assert.ok(r.reasons.some((s) => s.includes("empty")));
  });

  it("rejects a body with only braces", () => {
    const r = checkStub("{}");
    assert.equal(r.pass, false);
    assert.ok(r.reasons.some((s) => s.includes("empty")));
  });

  it("rejects a body with only pass", () => {
    const r = checkStub("pass");
    assert.equal(r.pass, false);
    assert.ok(r.reasons.some((s) => s.includes("empty")));
  });

  it("rejects a body with a TODO marker", () => {
    const body = `
      // TODO: write assertions
      const x = 1;
    `;
    const r = checkStub(body);
    assert.equal(r.pass, false);
    assert.ok(r.reasons.some((s) => s.includes("placeholder")));
  });

  it("rejects a body with FIXME", () => {
    const body = `
      const x = doThing();
      // FIXME: add real assertions
    `;
    const r = checkStub(body);
    assert.equal(r.pass, false);
    assert.ok(r.reasons.some((s) => s.includes("placeholder")));
  });

  it("rejects a not-implemented throw", () => {
    const body = `throw new Error("not implemented");`;
    const r = checkStub(body);
    assert.equal(r.pass, false);
    assert.ok(r.reasons.some((s) => s.includes("not-implemented")));
  });

  it("rejects a Python NotImplementedError", () => {
    const body = `raise NotImplementedError`;
    const r = checkStub(body);
    assert.equal(r.pass, false);
    assert.ok(r.reasons.some((s) => s.includes("not-implemented")));
  });

  it("rejects a body with code but no assertions", () => {
    const body = `
      const result = calculate();
      console.log(result);
    `;
    const r = checkStub(body);
    assert.equal(r.pass, false);
    assert.ok(r.reasons.some((s) => s.includes("no assertions")));
  });

  it("does not flag no-assertions on an empty body (empty is the primary reason)", () => {
    const r = checkStub("  \n  ");
    assert.equal(r.pass, false);
    assert.ok(r.reasons.some((s) => s.includes("empty")));
    assert.ok(!r.reasons.some((s) => s.includes("no assertions")));
  });

  it("accepts a bare return with assertion before it", () => {
    const body = `
      assert.ok(true);
      return;
    `;
    const r = checkStub(body);
    assert.equal(r.pass, true);
  });
});
