import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { isClassificationConfigPath } from "../../discovery/config-path.js";
import { isSensitiveProjectPath } from "../../discovery/sensitive-paths.js";
import type { Language } from "../contracts/contract.js";
import {
  isExcludedPythonDirectory,
  isPythonFile,
} from "../python-mirror/python-mirror-inputs.js";
import {
  isBackendIrrelevant,
  relativePathFor,
} from "../workspace/filtered-workspace-rules.js";

export type PresenceFilter = {
  skipDirectory(relativePath: string): boolean;
  matchFile(relativePath: string): boolean;
};

export function presenceFilter(language: Language): PresenceFilter {
  if (language === "python")
    return {
      skipDirectory: isExcludedPythonDirectory,
      matchFile: isPythonFile,
    };
  const source = language === "rust" ? /\.rs$/iu : /\.(?:cs|csx)$/iu;
  return {
    skipDirectory: isNativeExcluded,
    matchFile: (path) => source.test(path) && !isNativeExcluded(path),
  };
}

function isNativeExcluded(path: string): boolean {
  return (
    isSensitiveProjectPath(path) ||
    isClassificationConfigPath(path) ||
    isBackendIrrelevant(path)
  );
}

/**
 * Async reads keep a large tree from blocking the event loop. Symlinks are
 * skipped here; the mirror build still rejects them when it copies.
 */
export async function containsMatchingFile(
  rootPath: string,
  filter: PresenceFilter,
): Promise<boolean> {
  const pending = [""];
  while (pending.length > 0) {
    const directory = pending.pop() ?? "";
    for (const entry of await readEntries(join(rootPath, directory))) {
      if (entry.isSymbolicLink()) continue;
      const relativePath = relativePathFor(directory, entry.name);
      if (entry.isDirectory()) {
        if (!filter.skipDirectory(relativePath)) pending.push(relativePath);
      } else if (entry.isFile() && filter.matchFile(relativePath)) {
        return true;
      }
    }
  }
  return false;
}

async function readEntries(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function languagePresent(
  language: Language,
  rootPath: string,
): Promise<boolean> {
  return containsMatchingFile(rootPath, presenceFilter(language));
}
