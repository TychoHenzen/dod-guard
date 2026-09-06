import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";
import type { PythonMirrorInput } from "./python-mirror-input.js";

const PROHIBITED_KEYS = new Set([
  "extends",
  "venvPath",
  "venv",
  "extraPaths",
  "typeshedPath",
  "stubPath",
  "executionEnvironments",
  "pythonPath",
  "python.pythonPath",
  "python.venvPath",
  "python.analysis.extraPaths",
]);

export function containsUnsafePythonConfiguration(
  value: unknown,
  key?: string,
): boolean {
  return unsafeConfigurationValue(value, key);
}

function unsafeConfigurationValue(value: unknown, key?: string): boolean {
  if (isProhibitedKey(key)) return true;
  if (typeof value === "string") return unsafePath(value);
  if (Array.isArray(value)) return arrayHasUnsafeValue(value);
  return recordHasUnsafeValue(value);
}

function isProhibitedKey(key: string | undefined): boolean {
  return key !== undefined && PROHIBITED_KEYS.has(key);
}

function recordHasUnsafeValue(value: unknown): boolean {
  if (!isUnsafeRecord(value)) return false;
  return Object.entries(value).some(([name, child]) =>
    containsUnsafePythonConfiguration(child, name),
  );
}

function isUnsafeRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function arrayHasUnsafeValue(value: unknown[]): boolean {
  return value.some((item) => containsUnsafePythonConfiguration(item));
}

export function isSafePythonMirrorFile(file: PythonMirrorInput): boolean {
  return validMirrorPath(file) && validMirrorHash(file);
}

function validMirrorPath(file: PythonMirrorInput): boolean {
  return [
    file.path.endsWith(".py") || file.path.endsWith(".pyi"),
    !file.symlink,
    !file.sensitive,
    !unsafePath(file.path),
    !file.path.split(/[\\/]/).includes(".."),
  ].every(Boolean);
}

function validMirrorHash(file: PythonMirrorInput): boolean {
  return (
    /^[a-f0-9]{64}$/i.test(file.sha256) &&
    createHash("sha256").update(file.text).digest("hex") === file.sha256
  );
}

export function unsafePath(value: string): boolean {
  return (
    posix.isAbsolute(value) ||
    win32.isAbsolute(value) ||
    value.split(/[\\/]/).includes("..")
  );
}

export function uriToMirrorPath(uri: string, root: string): string | undefined {
  if (!uri.startsWith(`${root}/`)) return undefined;
  try {
    const path = decodeURIComponent(uri.slice(root.length + 1));
    return unsafePath(path) ? undefined : path;
  } catch {
    return undefined;
  }
}
