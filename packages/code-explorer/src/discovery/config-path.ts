import { readdirSync } from "node:fs";
import { join } from "node:path";

const configName = ".code-explorer.json";

/** Identifies the root-only configuration using the host filesystem's case rules. */
export function isClassificationConfigPath(path: string, platform = process.platform): boolean {
  if (path.includes("/") || path.includes("\\")) return false;
  return platform === "win32" ? path.toLocaleLowerCase("en-US") === configName : path === configName;
}

/** Returns the on-disk spelling so Windows case-insensitive configuration is read consistently. */
export function findClassificationConfigPath(projectRoot: string, platform = process.platform): string | undefined {
  return readdirSync(projectRoot, { withFileTypes: true }).find(
    (entry) => entry.isFile() && isClassificationConfigPath(entry.name, platform),
  )?.name;
}

export function classificationConfigPath(projectRoot: string, platform = process.platform): string | undefined {
  const name = findClassificationConfigPath(projectRoot, platform);
  return name ? join(projectRoot, name) : undefined;
}
