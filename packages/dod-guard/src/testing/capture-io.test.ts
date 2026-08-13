import assert from "node:assert/strict";
import { test } from "node:test";
import { captureIo } from "./capture-io.js";

test("io.write appends to out() in call order", () => {
  const { io, out } = captureIo();
  io.write("a");
  io.write("b");
  assert.equal(out(), "ab");
});

test("io.writeErr appends to err() without touching out()", () => {
  const { io, out, err } = captureIo();
  io.writeErr("oops");
  assert.equal(err(), "oops");
  assert.equal(out(), "");
});
