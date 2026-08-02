import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findRuns } from "./runs.mjs";

function command(name) {
  const text = `<command-name>/${name}</command-name>`;
  return { type: "user", message: { content: text } };
}

function work(label) {
  const content = [{ type: "text", text: label }];
  return { type: "assistant", message: { content } };
}

describe("findRuns", () => {
  it("runs to the end of the transcript when nothing follows", () => {
    const records = [command("tighten"), work("a"), work("b")];
    assert.deepEqual(findRuns(records, "tighten"), [
      {
        name: "tighten",
        args: "",
        form: "command",
        index: 0,
        timestamp: null,
        start: 0,
        end: 3,
        boundary: "end of transcript",
      },
    ]);
  });

  it("ends a run where the skill is called again", () => {
    const again = command("tighten");
    const records = [command("tighten"), work("a"), again, work("b")];
    const runs = findRuns(records, "tighten");
    assert.deepEqual(
      runs.map((run) => [run.start, run.end, run.boundary]),
      [
        [0, 2, "a second call"],
        [2, 4, "end of transcript"],
      ],
    );
  });

  it("ends a run at a /clear, because the context is gone", () => {
    const wipe = command("clear");
    const records = [command("tighten"), work("a"), wipe, work("b")];
    const [run] = findRuns(records, "tighten");
    assert.equal(run.end, 2);
    assert.equal(run.boundary, "a /clear");
  });

  it("keeps a call to another skill inside the run", () => {
    const records = [command("tighten"), command("blind-rewrite"), work("a")];
    const [run] = findRuns(records, "tighten");
    assert.equal(run.end, 3);
  });

  it("finds a run under the qualified name", () => {
    const records = [command("dod-guard:tighten"), work("a")];
    assert.equal(findRuns(records, "tighten").length, 1);
  });

  it("is empty when the skill never ran", () => {
    assert.deepEqual(findRuns([command("commit"), work("a")], "tighten"), []);
  });
});
