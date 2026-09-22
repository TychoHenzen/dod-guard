import { DECISION_RECORD_PATH } from "./fingerprint.js";

const ALLOWED_FIELDS = new Set(
  "findingId fingerprint baseIdentity targetIdentity reason author time".split(
    " ",
  ),
);

export interface ArchitectureAcknowledgement {
  findingId: string;
  fingerprint: string;
  baseIdentity?: string;
  targetIdentity?: string;
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
  validateRecordFields(record, index);
  return {
    findingId: recordValue(record, "findingId", index),
    fingerprint: recordValue(record, "fingerprint", index),
    ...provenance(record, index),
    reason: recordValue(record, "reason", index),
    author: recordValue(record, "author", index),
    time: recordValue(record, "time", index),
  };
}

function validateRecordFields(record: Record<string, unknown>, index: number) {
  const unexpected = Object.keys(record).find(
    (key) => !ALLOWED_FIELDS.has(key),
  );
  if (unexpected)
    throw new Error(
      `${DECISION_RECORD_PATH}[${index}].${unexpected} is not supported`,
    );
  if ("baseIdentity" in record !== "targetIdentity" in record)
    throw new Error(
      `${DECISION_RECORD_PATH}[${index}] must record both baseIdentity and targetIdentity`,
    );
}

function provenance(record: Record<string, unknown>, index: number) {
  if (!("baseIdentity" in record)) return {};
  return {
    baseIdentity: recordValue(record, "baseIdentity", index),
    targetIdentity: recordValue(record, "targetIdentity", index),
  };
}

export function appendArchitectureAcknowledgement(
  source: string,
  record: ArchitectureAcknowledgement,
): string {
  const records = [...parseArchitectureAcknowledgements(source), record];
  return `${JSON.stringify(records, null, 2)}\n`;
}
