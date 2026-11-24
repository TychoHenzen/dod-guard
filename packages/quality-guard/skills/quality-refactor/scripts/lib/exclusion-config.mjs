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

const ATTRIBUTE_NAME = /^[A-Za-z_]\w*$/;

export function isAttributeName(value) {
  return typeof value === "string" && ATTRIBUTE_NAME.test(value);
}

function attributeList(value) {
  if (value === undefined) {
    return [];
  }
  if (!(Array.isArray(value) && value.every(isAttributeName))) {
    throw new ExclusionConfigError(
      `${CONFIG_FILE}: registeredAttributes must be an array of attribute ` +
        'names such as "Service". Fix the file and rerun.',
    );
  }
  return [...value];
}

// The repository's settings: code that is not its own (excludePaths), and the
// C# attributes whose classes something builds by reflection, so no static
// reference reaches them (registeredAttributes).
export function loadRepoConfig(root) {
  const text = readConfigText(join(root, CONFIG_FILE));
  if (text === null) {
    return { excludePaths: [], registeredAttributes: [] };
  }
  const parsed = parseObject(text);
  return {
    excludePaths: excludeList(parsed.excludePaths),
    registeredAttributes: attributeList(parsed.registeredAttributes),
  };
}
