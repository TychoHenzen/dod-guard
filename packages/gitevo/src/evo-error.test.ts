import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EvoError } from "./evo-error.js";

describe("EvoError", () => {
  it("is an Error", () => assert.ok(new EvoError("x") instanceof Error));
  it("is an EvoError", () => assert.ok(new EvoError("x") instanceof EvoError));
  it("keeps the message", () => assert.equal(new EvoError("boom").message, "boom"));
  it("names itself", () => assert.equal(new EvoError("x").name, "EvoError"));
  it("carries a stack", () => assert.ok(new EvoError("x").stack));
});
