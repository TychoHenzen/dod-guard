import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { traceOf } from "./trace.mjs";

const RUN = { start: 0, end: 99 };

function bash(command, extra = {}) {
  const content = [{ type: "tool_use", name: "Bash", input: { command } }];
  return { type: "assistant", message: { content }, ...extra };
}

function failure() {
  const content = [{ type: "tool_result", content: "no", is_error: true }];
  return { type: "user", message: { content } };
}

function says(text) {
  const content = [{ type: "text", text }];
  return { type: "user", message: { content } };
}

function agent() {
  const input = { subagent_type: "blind-writer", description: "write" };
  const content = [{ type: "tool_use", name: "Agent", input }];
  return { type: "assistant", message: { content } };
}

describe("traceOf", () => {
  it("counts what a reader checks first", () => {
    const records = [bash("ls"), failure(), says("wrong phase"), agent()];
    assert.deepEqual(traceOf(records, RUN).counts, {
      steps: 4,
      tools: 2,
      errors: 1,
      users: 1,
      agents: 1,
    });
  });

  it("leaves subagent steps out by default", () => {
    const records = [bash("ls"), bash("pwd", { isSidechain: true })];
    assert.equal(traceOf(records, RUN).counts.steps, 1);
  });

  it("includes subagent steps when asked", () => {
    const records = [bash("ls"), bash("pwd", { isSidechain: true })];
    const trace = traceOf(records, RUN, { sidechains: true });
    assert.equal(trace.counts.steps, 2);
  });

  it("reads only the records inside the run", () => {
    const records = [bash("before"), bash("inside"), bash("after")];
    const trace = traceOf(records, { start: 1, end: 2 });
    assert.deepEqual(
      trace.steps.map((step) => step.detail),
      ["inside"],
    );
  });

  it("caps the printed steps and says so", () => {
    const records = [bash("a"), bash("b"), bash("c")];
    const trace = traceOf(records, RUN, { maxSteps: 2 });
    assert.equal(trace.steps.length, 2);
    assert.equal(trace.truncated, true);
    assert.equal(trace.counts.steps, 3);
  });

  it("does not claim truncation when everything fits", () => {
    assert.equal(traceOf([bash("a")], RUN, { maxSteps: 2 }).truncated, false);
  });
});
