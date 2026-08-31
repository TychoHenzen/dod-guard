import { DECISION_RECORD_PATH } from "./fingerprint.js";

export interface ArchitectureAcknowledgement {
  findingId: string;
  fingerprint: string;
  reason: string;
  author: string;
  time: string;
}

function nonEmptyString(value: unknown, location: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${location} must be a non-empty string`);
  return value.trim();
}

/** Parses the append-only record with an intentionally closed five-field schema. */
export function parseArchitectureAcknowledgements(source: string): ArchitectureAcknowledgement[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${DECISION_RECORD_PATH} must contain valid JSON`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${DECISION_RECORD_PATH} must contain an array`);
  return parsed.map((item, index) => {
    if (item === null || typeof item !== "object" || Array.isArray(item))
      throw new Error(`${DECISION_RECORD_PATH}[${index}] must be an object`);
    const record = item as Record<string, unknown>;
    const unexpected = Object.keys(record).filter(
      (key) => !["findingId", "fingerprint", "reason", "author", "time"].includes(key),
    );
    if (unexpected.length > 0) throw new Error(`${DECISION_RECORD_PATH}[${index}].${unexpected[0]} is not supported`);
    return {
      findingId: nonEmptyString(record.findingId, `${DECISION_RECORD_PATH}[${index}].findingId`),
      fingerprint: nonEmptyString(record.fingerprint, `${DECISION_RECORD_PATH}[${index}].fingerprint`),
      reason: nonEmptyString(record.reason, `${DECISION_RECORD_PATH}[${index}].reason`),
      author: nonEmptyString(record.author, `${DECISION_RECORD_PATH}[${index}].author`),
      time: nonEmptyString(record.time, `${DECISION_RECORD_PATH}[${index}].time`),
    };
  });
}

export function appendArchitectureAcknowledgement(source: string, record: ArchitectureAcknowledgement): string {
  return `${JSON.stringify([...parseArchitectureAcknowledgements(source), record], null, 2)}\n`;
}
