// A transcript is one JSON document per line. Claude Code appends to it while
// the session runs, so the last line is sometimes half written. A parse error
// on one line must never cost the other two thousand.

import { readFileSync } from "node:fs";

function tryParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function parseRecords(text) {
  const records = [];
  for (const line of text.split("\n")) {
    const record = line.trim() ? tryParse(line) : null;
    if (record) {
      records.push(...normalizeRecord(record));
    }
  }
  return records;
}

function normalizeRecord(record) {
  if (record.type !== "response_item") return normalizeEvent(record);
  return normalizeResponse(record);
}

function normalizeEvent(record) {
  const isUser = record.type === "event_msg" && record.payload?.type === "user_message";
  return isUser ? [{ type: "user", timestamp: record.timestamp, message: { content: record.payload.message } }] : [record];
}

function normalizeResponse(record) {
  const payload = record.payload ?? {};
  const handlers = { message: normalizeMessage, custom_tool_call: normalizeToolCall, custom_tool_call_output: normalizeToolOutput };
  return handlers[payload.type]?.(record, payload) ?? [];
}

function normalizeMessage(record, payload) {
  const content = payload.content?.map((part) => ({ type: "text", text: part.text }));
  return [{ type: payload.role === "user" ? "user" : "assistant", timestamp: record.timestamp, message: { content } }];
}

function normalizeToolCall(record, payload) {
  let input = payload.input;
  try { input = JSON.parse(input); } catch { /* retain raw input */ }
  return [{ type: "assistant", timestamp: record.timestamp, message: { content: [{ type: "tool_use", name: payload.name, input }] } }];
}

function normalizeToolOutput(record, payload) {
  const result = { content: payload.output, is_error: payload.status === "failed" };
  return [{ type: "user", timestamp: record.timestamp, message: { content: [{ type: "tool_result", ...result }] } }];
}

export function readRecords(path) {
  return parseRecords(readFileSync(path, "utf8"));
}
