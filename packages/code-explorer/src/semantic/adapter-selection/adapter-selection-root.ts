import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function findPackageRoot(start: string): string {
  let directory = resolve(start);
  while (true) {
    if (isCodeExplorerPackage(directory)) return directory;
    const parent = dirname(directory);
    if (parent === directory)
      throw new Error("invalid adapter selection record");
    directory = parent;
  }
}

function isCodeExplorerPackage(directory: string): boolean {
  try {
    const parseJson = JSON.parse;
    const packageInfo = parseJson(
      readFileSync(join(directory, "package.json"), "utf8"),
    ) as { name?: unknown };
    return packageInfo.name === "code-explorer";
  } catch {
    return false;
  }
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
