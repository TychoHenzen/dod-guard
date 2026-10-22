// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { statusValueName } from "./project-reads.mjs";

test("statusValueName reads one name from each REST spelling and gives null for an absent value", () => {
  assert.equal(statusValueName("Done"), "Done");
  assert.equal(statusValueName({ name: "Done" }), "Done");
  assert.equal(statusValueName({ name: { raw: "Done", html: "Done" } }), "Done");
  assert.equal(statusValueName(null), null);
  assert.equal(statusValueName(undefined), null);
});

test("statusValueName keeps its rejection messages", () => {
  assert.throws(() => statusValueName({ id: "x" }), { message: "Status value is not a name." });
  assert.throws(() => statusValueName({ name: { raw: " " } }), { message: "Status value has a blank name." });
  assert.throws(() => statusValueName({ name: { raw: "Done", html: "Todo" } }), {
    message: "Status value names disagree.",
  });
});
