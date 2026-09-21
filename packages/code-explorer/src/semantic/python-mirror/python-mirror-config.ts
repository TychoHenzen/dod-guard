import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import type { ProjectRoot } from "../project-root/project-root.js";

export function readProjectPythonConfiguration(
  root: ProjectRoot,
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const pyright = protectedOptionalRead(root, "pyrightconfig.json");
  if (pyright !== undefined) config.pyrightconfig = parseJson(pyright);
  const pyproject = protectedOptionalRead(root, "pyproject.toml");
  if (pyproject !== undefined) {
    const parsed = parseToolPyright(pyproject);
    if (parsed === undefined) throw new Error("unsafe_backend_mode");
    if (Object.keys(parsed).length) config.tool_pyright = parsed;
  }
  return config;
}

function parseJson(source: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(source);
    if (!isRecord(parsed)) throw new Error("invalid");
    return parsed;
  } catch {
    throw new Error("unsafe_backend_mode");
  }
}

function protectedOptionalRead(
  root: ProjectRoot,
  path: string,
): string | undefined {
  const absolute = join(root.canonicalPath, path);
  if (!existsSync(absolute)) return undefined;
  if (lstatSync(absolute).isSymbolicLink())
    throw new Error("unsafe_backend_mode");
  return root.protectedRead(path).bytes;
}

function parseToolPyright(toml: string): Record<string, unknown> | undefined {
  const lines = toml.replace(/^\uFEFF/, "").split(/\r?\n/);
  let section: "active" | "inactive" = "inactive";
  const result: Record<string, unknown> = {};
  for (const raw of lines) {
    const parsed = parseToolLine(raw, section);
    section = parsed.section;
    if (parsed.invalid) return undefined;
    if (parsed.assignment)
      result[parsed.assignment[0]] = parseTomlValue(parsed.assignment[1]);
  }
  return result;
}

function parseToolLine(
  raw: string,
  section: "active" | "inactive",
): {
  section: "active" | "inactive";
  invalid: boolean;
  assignment?: [string, string];
} {
  const line = raw.replace(/\s+#.*$/, "").trim();
  if (!line) return { section, invalid: false };
  if (/^\[.*\]$/.test(line))
    return {
      section: line === "[tool.pyright]" ? "active" : "inactive",
      invalid: false,
    };
  if (section === "inactive") return { section, invalid: false };
  const match = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
  return match
    ? {
        section,
        invalid: false,
        assignment: [match[1], match[2]],
      }
    : { section, invalid: true };
}

function parseTomlValue(value: string): unknown {
  const trimmed = value.trim();
  if (/^(true|false)$/.test(trimmed)) return trimmed === "true";
  if (/^["'].*["']$/.test(trimmed)) return trimmed.slice(1, -1);
  if (!/^\[.*\]$/.test(trimmed)) return trimmed;
  const inner = trimmed.slice(1, -1).trim();
  return inner ? inner.split(",").map(parseTomlValue) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
