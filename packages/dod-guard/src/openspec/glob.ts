import { promises as fs } from "node:fs";
import * as path from "node:path";

/** Escape a single glob segment (no `**`) into an anchored RegExp. */
function segmentToRegExp(segment: string): RegExp {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

async function listEntries(dir: string): Promise<import("node:fs").Dirent[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function walkFiles(dir: string, segment: string): Promise<string[]> {
  const re = segmentToRegExp(segment);
  const entries = await listEntries(dir);
  return entries.filter((e) => e.isFile() && re.test(e.name)).map((e) => path.join(dir, e.name));
}

async function walkDirs(dir: string, segment: string, rest: string[]): Promise<string[]> {
  const re = segmentToRegExp(segment);
  const entries = await listEntries(dir);
  const results: string[] = [];
  for (const e of entries) {
    if (e.isDirectory() && re.test(e.name)) {
      results.push(...(await resolveSegments(path.join(dir, e.name), rest)));
    }
  }
  return results;
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".hg", "__pycache__", ".tox", ".mypy_cache", ".venv", "venv", ".env", "env"]);

/** `**` matches zero or more directory levels (including zero). */
async function walkDoubleStar(dir: string, rest: string[]): Promise<string[]> {
  const results = await resolveSegments(dir, rest);
  const entries = await listEntries(dir);
  for (const e of entries) {
    if (e.isDirectory() && !SKIP_DIRS.has(e.name)) {
      results.push(...(await walkDoubleStar(path.join(dir, e.name), rest)));
    }
  }
  return results;
}

async function resolveSegments(dir: string, segments: string[]): Promise<string[]> {
  if (segments.length === 0) return [];
  const [segment, ...rest] = segments;
  if (segment === "**") return walkDoubleStar(dir, rest);
  if (rest.length === 0) return walkFiles(dir, segment);
  return walkDirs(dir, segment, rest);
}

/**
 * Minimal glob resolver for OpenSpec's `dependencies[].path` patterns
 * (e.g. "specs/**\/*.md"). Supports literal segments, `*` within a
 * segment, and `**` for zero-or-more directory levels. Returns absolute
 * file paths.
 */
export async function resolveGlob(baseDir: string, pattern: string): Promise<string[]> {
  const segments = pattern.split(/[\\/]/).filter((s) => s.length > 0);
  return resolveSegments(baseDir, segments);
}
