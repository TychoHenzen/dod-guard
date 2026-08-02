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
      records.push(record);
    }
  }
  return records;
}

export function readRecords(path) {
  return parseRecords(readFileSync(path, "utf8"));
}
