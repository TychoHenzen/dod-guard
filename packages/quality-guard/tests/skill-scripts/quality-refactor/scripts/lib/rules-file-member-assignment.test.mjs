import assert from "node:assert/strict";
import { test } from "node:test";
import { scanViolations, tsFile } from "./rules-file-fixtures.test.mjs";

function unusedLocals(code) {
  return scanViolations(tsFile("src/runtime.ts", code)).filter(
    (violation) => violation.rule === "unused-local",
  );
}

test("a property assignment of an arrow function is not an unused local", () => {
  const code = [
    "const transport = {};",
    "function wire(closer) {",
    '  transport.onclose = () => closer.close("transport_close");',
    "  return transport;",
    "}",
    "wire({ close() {} });",
  ].join("\n");
  assert.deepEqual(unusedLocals(code), []);
});

test("a nested property assignment is not an unused local", () => {
  const code = [
    "const holder = { target: {} };",
    "function attach() {",
    "  holder.target.onready = () => 1;",
    "  return holder;",
    "}",
    "attach();",
  ].join("\n");
  assert.deepEqual(unusedLocals(code), []);
});

test("an uncalled local function is still an unused local", () => {
  const code = [
    "function helper() {",
    "  return 1;",
    "}",
    "export const value = 2;",
  ].join("\n");
  const found = unusedLocals(code);
  assert.equal(found.length, 1);
  assert.match(found[0].message, /^helper\(\)/);
});
