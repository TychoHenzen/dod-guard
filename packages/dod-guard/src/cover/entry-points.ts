/**
 * `openspec/entry-points.json`: the files a project considers user-facing for
 * each package, keyed by package directory. No fixed rule identifies an entry
 * point across a CLI, an MCP server, and a game's input handler, so a human
 * declares it. A package absent from this file gets an honest report - every
 * one of its bound scenarios reports covered-but-not-integrated with a reason
 * - rather than a crash or a silent pass.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { packageDirForGroup } from "./package-dir.js";

export type EntryPointsFile = Record<string, string[]>;

interface EntryPointResult {
  files: string[];
  /** False when the package directory has no key in entry-points.json at all
   * - distinct from a key present with an empty array, which a project can
   * write deliberately. */
  declared: boolean;
}

/** Reads `openspec/entry-points.json`. A missing file reads as "nothing
 * declared anywhere" rather than an error - a project that hasn't adopted
 * this yet still gets a report, just one that says so. */
export async function loadEntryPoints(cwd: string): Promise<EntryPointsFile> {
  try {
    const raw = await fs.readFile(path.join(cwd, "openspec", "entry-points.json"), "utf-8");
    return JSON.parse(raw) as EntryPointsFile;
  } catch {
    return {};
  }
}

export function entryPointsForGroup(entryPoints: EntryPointsFile, group: string): EntryPointResult {
  const pkgDir = packageDirForGroup(group);
  const files = entryPoints[pkgDir];
  return files === undefined ? { files: [], declared: false } : { files, declared: true };
}
