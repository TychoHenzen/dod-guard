import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRecords } from "./records.mjs";

describe("parseRecords", () => {
  it("normalizes Codex response items", () => {
    const records = parseRecords([
      JSON.stringify({ type: "event_msg", timestamp: "t", payload: { type: "user_message", message: "[$dod-guard:skill-debug]" } }),
      JSON.stringify({ type: "response_item", timestamp: "t", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "inspect" }] } }),
      JSON.stringify({ type: "response_item", timestamp: "t", payload: { type: "custom_tool_call", name: "exec", input: "{\"cmd\":\"rg\"}" } }),
    ].join("\n"));
    assert.equal(records[0].type, "user");
    assert.equal(records[1].message.content[0].text, "inspect");
    assert.equal(records[2].message.content[0].name, "exec");
  });
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
