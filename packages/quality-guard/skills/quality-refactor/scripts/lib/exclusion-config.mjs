import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_FILE = ".quality-guard.json";

export class ExclusionConfigError extends Error {}

function readConfigText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new ExclusionConfigError(
      `${CONFIG_FILE} could not be read: ${error.message}. Fix the file and rerun.`,
    );
  }
}

function parseObject(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ExclusionConfigError(
      `${CONFIG_FILE} must contain valid JSON. Fix the file and rerun.`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new ExclusionConfigError(
      `${CONFIG_FILE} must hold a JSON object. Fix the file and rerun.`,
    );
  return parsed;
}

function excludeList(value) {
  if (value === undefined) return [];
  const valid =
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry !== "");
  if (!valid)
    throw new ExclusionConfigError(
      `${CONFIG_FILE}: excludePaths must be an array of non-empty strings. Fix the file and rerun.`,
    );
  return value.map((entry) => entry.replaceAll("\\", "/"));
}

export function loadExcludePaths(root) {
  const text = readConfigText(join(root, CONFIG_FILE));
  if (text === null) return [];
  return excludeList(parseObject(text).excludePaths);
}
