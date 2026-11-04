import { readFileSync } from "node:fs";

const UNREADABLE = { unreadable: true };

function parseRecord(text) {
  try {
    const record = JSON.parse(text);
    return Number.isInteger(record.pid) && Number.isFinite(record.startedAt) ? record : UNREADABLE;
  } catch {
    return UNREADABLE;
  }
}

// Returns null when no record exists, {unreadable: true} for a damaged one.
export function readRecord(pidFile) {
  try {
    return parseRecord(readFileSync(pidFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
