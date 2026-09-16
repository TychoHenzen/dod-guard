import assert from "node:assert/strict";
import { test } from "node:test";
import { namesIn } from "./parse-more-support.test.mjs";

test("a Go if init call is not a definition", () => {
  const src = [
    "func caller() {",
    "    if v, ok := lookup(); ok { use(v) }",
    "}",
  ].join("\n");
  assert.deepEqual(namesIn(src, "go"), ["caller"]);
});

test("a Go range call is not a definition", () => {
  const src = [
    "func caller() {",
    "    for _, v := range items() { use(v) }",
    "}",
  ].join("\n");
  assert.deepEqual(namesIn(src, "go"), ["caller"]);
});

test("a plain Go func is a definition", () => {
  const src = ["func Add(a, b int) int {", "    return a + b", "}"].join("\n");
  assert.deepEqual(namesIn(src, "go"), ["Add"]);
});

test("a Go method with a receiver is a definition", () => {
  const src = [
    "func (s *Server) Handle(w Writer) {",
    "    s.dispatch(w)",
    "}",
  ].join("\n");
  assert.deepEqual(namesIn(src, "go"), ["Handle"]);
});

test("calls followed by commas are not phantom definitions", () => {
  const src = [
    "function caller() {",
    "    const value = new URL(host, port), fallback = value;",
    "}",
  ].join("\n");
  assert.deepEqual(namesIn(src, "ts"), ["caller"]);
});
