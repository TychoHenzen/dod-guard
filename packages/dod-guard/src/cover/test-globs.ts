import { promises as fs } from "node:fs";
import * as path from "node:path";

export class TestGlobsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestGlobsError";
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function validateEntry(key: string, value: unknown): string[] {
  if (!isStringArray(value)) {
    throw new TestGlobsError(`openspec/test-globs.json: value for "${key}" must be an array of strings`);
  }
  return value;
}

function validateTestGlobs(raw: string): Record<string, string[]> {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TestGlobsError("openspec/test-globs.json must be a JSON object");
  }
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    result[key] = validateEntry(key, value);
  }
  return result;
}

export async function loadTestGlobs(cwd: string): Promise<Record<string, string[]>> {
  const filePath = path.join(cwd, "openspec", "test-globs.json");
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    return {};
  }
  return validateTestGlobs(raw);
}
