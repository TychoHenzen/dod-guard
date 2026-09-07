import type { Language } from "../contracts/contract.js";

export function containsVirtualDocument(input: unknown): boolean {
  if (!isRecordOrArray(input)) return false;
  if (Array.isArray(input)) return input.some(containsVirtualDocument);
  return virtualRecord(input);
}

function virtualRecord(record: Record<string, unknown>): boolean {
  if (typeof record.uri === "string" && !record.uri.startsWith("file:"))
    return true;
  return Object.values(record).some(containsVirtualDocument);
}

export function containsUnexpectedLanguage(
  input: unknown,
  allowedLanguages: readonly Language[],
): boolean {
  if (!isRecordOrArray(input)) return false;
  if (Array.isArray(input))
    return input.some((item) =>
      containsUnexpectedLanguage(item, allowedLanguages),
    );
  return unexpectedLanguageRecord(input, allowedLanguages);
}

function unexpectedLanguageRecord(
  record: Record<string, unknown>,
  allowedLanguages: readonly Language[],
): boolean {
  if (
    "language" in record &&
    typeof record.language === "string" &&
    !allowedLanguages.includes(record.language as Language)
  )
    return true;
  return Object.values(record).some((item) =>
    containsUnexpectedLanguage(item, allowedLanguages),
  );
}

export function containsStaleRevision(
  input: unknown,
  currentGeneration: number,
): boolean {
  if (!isRecordOrArray(input) || Array.isArray(input)) return false;
  const revision = input.revision;
  return isRecord(revision) && revision.generation !== currentGeneration;
}

function isRecordOrArray(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return !!value && typeof value === "object";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
