import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRecords } from "./records.mjs";

describe("parseRecords", () => {
  it("reads one record per line", () => {
    const text = '{"type":"user"}\n{"type":"assistant"}\n';
    assert.deepEqual(parseRecords(text), [
      { type: "user" },
      { type: "assistant" },
    ]);
  });

  it("keeps good records when the file ends mid-write", () => {
    const text = '{"type":"user"}\n{"type":"assis';
    assert.deepEqual(parseRecords(text), [{ type: "user" }]);
  });

  it("drops a broken line from the middle", () => {
    const text = '{"type":"a"}\nnot json\n{"type":"b"}\n';
    assert.deepEqual(parseRecords(text), [{ type: "a" }, { type: "b" }]);
  });

  it("is empty for an empty file", () => {
    assert.deepEqual(parseRecords(""), []);
  });
});
