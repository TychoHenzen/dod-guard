import { DECISION_RECORD_PATH } from "./fingerprint.js";

export interface ArchitectureAcknowledgement {
  findingId: string;
  fingerprint: string;
  reason: string;
  author: string;
  time: string;
}

function nonEmptyString(value: unknown, location: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${location} must be a non-empty string`);
  return value.trim();
}

function recordValue(
  record: Record<string, unknown>,
  key: string,
  index: number,
): string {
  return nonEmptyString(
    record[key],
    `${DECISION_RECORD_PATH}[${index}].${key}`,
  );
}

/** Parses the append-only record with an intentionally closed five-field
 * schema. */
export function parseArchitectureAcknowledgements(
  source: string,
): ArchitectureAcknowledgement[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${DECISION_RECORD_PATH} must contain valid JSON`);
  }
  if (!Array.isArray(parsed))
    throw new Error(`${DECISION_RECORD_PATH} must contain an array`);
  return parsed.map(parseRecord);
}

function parseRecord(
  item: unknown,
  index: number,
): ArchitectureAcknowledgement {
  if (item === null || typeof item !== "object" || Array.isArray(item))
    throw new Error(`${DECISION_RECORD_PATH}[${index}] must be an object`);
  const record = item as Record<string, unknown>;
  const allowed = ["findingId", "fingerprint", "reason", "author", "time"];
  const unexpected = Object.keys(record).find((key) => !allowed.includes(key));
  if (unexpected)
    throw new Error(
      `${DECISION_RECORD_PATH}[${index}].${unexpected} is not supported`,
    );
  return {
    findingId: recordValue(record, "findingId", index),
    fingerprint: recordValue(record, "fingerprint", index),
    reason: recordValue(record, "reason", index),
    author: recordValue(record, "author", index),
    time: recordValue(record, "time", index),
  };
}

export function appendArchitectureAcknowledgement(
  source: string,
  record: ArchitectureAcknowledgement,
): string {
  const records = [...parseArchitectureAcknowledgements(source), record];
  return `${JSON.stringify(records, null, 2)}\n`;
}
