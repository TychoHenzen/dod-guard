import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { resolveWindowsNativeExecutable } from "./codex-shim.mjs";

function pathValue(environment) {
  const direct = [environment?.PATH, environment?.Path].find((value) => typeof value === "string");
  if (direct !== undefined) return direct;
  const key = Object.keys(environment ?? {}).find((name) => name.toLowerCase() === "path");
  return typeof key === "string" ? environment[key] : "";
}

function windowsPathEntries(environment) {
  return pathValue(environment)
    .split(";")
    .filter((entry) => entry.length > 0)
    .map((entry) => resolve(entry));
}

function existingFiles(entries, fileName) {
  return entries.map((entry) => join(entry, fileName)).filter((path) => existsSync(path));
}

function nativeBehindShim(entries, architecture) {
  for (const shimPath of existingFiles(entries, "codex.cmd")) {
    const nativePath = resolveWindowsNativeExecutable(shimPath, architecture);
    if (nativePath) return nativePath;
  }
  return undefined;
}

export function resolveCodexExecutable(
  platform = process.platform,
  environment = process.env,
  architecture = process.arch,
) {
  if (platform !== "win32") return "codex";
  const entries = windowsPathEntries(environment);
  return existingFiles(entries, "codex.exe")[0] ?? nativeBehindShim(entries, architecture);
}
