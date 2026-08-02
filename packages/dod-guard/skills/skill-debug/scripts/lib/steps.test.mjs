import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stepsOf } from "./steps.mjs";

function assistant(content, extra = {}) {
  return { type: "assistant", message: { content }, ...extra };
}

function user(content, extra = {}) {
  return { type: "user", message: { content }, ...extra };
}

describe("stepsOf on tool calls", () => {
  it("digests a Bash call down to its command", () => {
    const record = assistant([
      { type: "tool_use", name: "Bash", input: { command: "npm test" } },
    ]);
    assert.deepEqual(stepsOf(record), [
      { kind: "tool", name: "Bash", detail: "npm test", sidechain: false },
    ]);
  });

  it("digests an Agent call to the agent and the task", () => {
    const description = "look at a.ts";
    const input = { subagent_type: "intent-analyst", description };
    const record = assistant([{ type: "tool_use", name: "Agent", input }]);
    assert.equal(stepsOf(record)[0].detail, "intent-analyst - look at a.ts");
  });

  it("falls back to the whole input for an unknown tool", () => {
    const record = assistant([
      { type: "tool_use", name: "Weird", input: { a: 1 } },
    ]);
    assert.equal(stepsOf(record)[0].detail, '{"a":1}');
  });

  it("keeps one step per tool call in one message", () => {
    const record = assistant([
      { type: "tool_use", name: "Bash", input: { command: "one" } },
      { type: "tool_use", name: "Bash", input: { command: "two" } },
    ]);
    assert.deepEqual(
      stepsOf(record).map((step) => step.detail),
      ["one", "two"],
    );
  });
});

describe("stepsOf on results", () => {
  it("marks a failed tool result", () => {
    const record = user([
      { type: "tool_result", content: "boom", is_error: true },
    ]);
    const [step] = stepsOf(record);
    assert.equal(step.name, "ERR");
    assert.equal(step.ok, false);
  });

  it("marks a result with no error flag as ok", () => {
    const record = user([{ type: "tool_result", content: "fine" }]);
    assert.equal(stepsOf(record)[0].ok, true);
  });

  it("reads a result delivered as content blocks", () => {
    const content = [
      { type: "tool_result", content: [{ type: "text", text: "hello" }] },
    ];
    assert.equal(stepsOf(user(content))[0].detail, "hello");
  });
});

describe("stepsOf on prose", () => {
  it("keeps a user interjection", () => {
    const record = user([{ type: "text", text: "stop, you skipped a phase" }]);
    assert.deepEqual(stepsOf(record), [
      {
        kind: "user",
        name: "",
        detail: "stop, you skipped a phase",
        sidechain: false,
      },
    ]);
  });

  it("collapses the skill body to a marker", () => {
    const body = "Base directory for this skill: /x\n# Tighten\nFind the code";
    assert.deepEqual(stepsOf(user([{ type: "text", text: body }])), [
      { kind: "load", name: "", detail: "skill body loaded", sidechain: false },
    ]);
  });

  it("drops a user turn that is only a system reminder", () => {
    const text = "<system-reminder>housekeeping</system-reminder>";
    assert.deepEqual(stepsOf(user([{ type: "text", text }])), []);
  });

  it("keeps the words around a stripped reminder", () => {
    const text = "do this <system-reminder>noise</system-reminder> now";
    const [step] = stepsOf(user([{ type: "text", text }]));
    assert.equal(step.detail, "do this now");
  });

  it("reads a message whose content is a bare string", () => {
    assert.equal(stepsOf(user("plain words"))[0].detail, "plain words");
  });

  it("flags a step that came from a subagent", () => {
    const record = assistant([{ type: "text", text: "done" }], {
      isSidechain: true,
    });
    assert.equal(stepsOf(record)[0].sidechain, true);
  });
});
