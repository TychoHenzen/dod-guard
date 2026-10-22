import { realpath } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";

const ROOT_TOKEN = "<ROOT>";
const ROOT_FLAGS = process.platform === "win32" ? "gi" : "g";

function toForwardSlashes(text) {
  return text.replaceAll("\\", "/");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function temporaryRootPatterns(fixture) {
  const temporaryRoot = dirname(fixture.pluginRoot);
  const roots = [temporaryRoot, await realpath(temporaryRoot)];
  return roots.map((root) => new RegExp(escapeRegExp(toForwardSlashes(root)), ROOT_FLAGS));
}

// Operating system and Node error text follows the first ": " in a reason, so the
// snapshot keeps only the part this CLI wrote and stays the same on Windows and Linux.
function normalizeString(text, patterns, key) {
  const replaced = patterns.reduce((value, pattern) => value.replace(pattern, ROOT_TOKEN), toForwardSlashes(text));
  return key === "reason" ? replaced.split(": ")[0] : replaced;
}

function normalizeValue(value, patterns, key) {
  if (typeof value === "string") return normalizeString(value, patterns, key);
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, patterns));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, normalizeValue(item, patterns, name)]),
    );
  }
  return value;
}

function streamsOf(result) {
  if (result.status === 0) return { stream: "stdout", raw: result.stdout, other: result.stderr };
  return { stream: "stderr", raw: result.stderr, other: result.stdout };
}

export async function normalizeRun(result, fixture) {
  const { stream, raw, other } = streamsOf(result);
  const parsed = JSON.parse(raw);
  return {
    status: result.status,
    stream,
    otherStreamEmpty: other === "",
    formatted: raw === `${JSON.stringify(parsed, null, 2)}\n`,
    topKeys: Object.keys(parsed),
    observedKeys: Object.keys(parsed.observed ?? {}),
    body: normalizeValue(parsed, await temporaryRootPatterns(fixture)),
  };
}
