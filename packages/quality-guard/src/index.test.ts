import assert from "node:assert/strict";
import { test } from "node:test";
import { text, toolError } from "./index.js";

test("text wraps a payload in the MCP content shape", () => {
  assert.deepEqual(text("hello"), { content: [{ type: "text", text: "hello" }] });
});

test("toolError reports an Error message without leaking a stack", () => {
  const result = toolError(new Error("baseline not found"));
  assert.equal(result.content[0].text, "ERROR: baseline not found");
});

test("toolError stringifies a non-Error throw", () => {
  assert.equal(toolError("plain string").content[0].text, "ERROR: plain string");
});
