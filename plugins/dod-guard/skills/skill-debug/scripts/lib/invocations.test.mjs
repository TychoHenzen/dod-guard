import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findInvocations, skillMatches } from "./invocations.mjs";

function command(text) {
  return { type: "user", message: { content: text } };
}

function toolUse(name, input) {
  const content = [{ type: "tool_use", name, input }];
  return { type: "assistant", message: { content } };
}

describe("skillMatches", () => {
  it("matches a bare name against a qualified one", () => {
    assert.equal(skillMatches("dod-guard:tighten", "tighten"), true);
    assert.equal(skillMatches("tighten", "dod-guard:tighten"), true);
  });

  it("matches a name the user typed with a slash", () => {
    assert.equal(skillMatches("dod-guard:tighten", "/tighten"), true);
  });

  it("does not match a different skill", () => {
    assert.equal(skillMatches("dod-guard:tighten", "blind-rewrite"), false);
  });

  it("does not match an empty candidate", () => {
    assert.equal(skillMatches("", "tighten"), false);
    assert.equal(skillMatches(undefined, "tighten"), false);
  });
});

describe("findInvocations", () => {
  it("finds a slash command in a user message", () => {
    const records = [command("<command-name>/tighten</command-name>")];
    const found = findInvocations(records);
    assert.deepEqual(found, [
      { name: "tighten", args: "", form: "command", index: 0, timestamp: null },
    ]);
  });

  it("finds a Skill tool call and keeps its arguments", () => {
    const call = toolUse("Skill", { skill: "dod-guard:tighten", args: "a.ts" });
    const found = findInvocations([call]);
    assert.equal(found.length, 1);
    assert.equal(found[0].name, "dod-guard:tighten");
    assert.equal(found[0].args, "a.ts");
    assert.equal(found[0].form, "tool");
  });

  it("ignores tool calls that are not Skill", () => {
    assert.deepEqual(findInvocations([toolUse("Bash", { command: "ls" })]), []);
  });

  it("records the position of each invocation", () => {
    const records = [
      command("hello"),
      command("<command-name>/clear</command-name>"),
      command("<command-name>/tighten</command-name>"),
    ];
    assert.deepEqual(
      findInvocations(records).map((entry) => [entry.name, entry.index]),
      [
        ["clear", 1],
        ["tighten", 2],
      ],
    );
  });
});
