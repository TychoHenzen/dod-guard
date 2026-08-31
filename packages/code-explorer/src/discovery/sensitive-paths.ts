/** Non-overridable portable sensitive-path denylist. It deliberately has no path-returning API. */
export function isSensitiveProjectPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === "..")) return true;
  const parts = normalized.split("/");
  const file = parts.at(-1) ?? "";
  return (
    parts.some((part) => /^(\.git|\.hg|\.svn)$/iu.test(part)) ||
    /^\.env(?:\..+)?$/iu.test(file) ||
    /\.(pem|key|pfx|p12)$/iu.test(file) ||
    /^(id_rsa|id_dsa|id_ecdsa|id_ed25519|\.npmrc|\.pypirc|nuget\.config)$/iu.test(file)
  );
}

/** Counts denied paths without retaining names, so status can expose only the aggregate. */
export function countSensitiveProjectPaths(paths: Iterable<string>): number {
  let count = 0;
  for (const path of paths) if (isSensitiveProjectPath(path)) count += 1;
  return count;
}

/** Walks names only and never returns a denied path. */
export function countSensitivePathsUnderRoot(root: string): number {
  const visit = (directory: string, relativeDirectory: string): number => {
    let count = 0;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (isSensitiveProjectPath(relativePath)) {
        count += 1;
        continue;
      }
      const absolute = join(directory, entry.name);
      if (entry.isDirectory() && !lstatSync(absolute).isSymbolicLink()) count += visit(absolute, relativePath);
    }
    return count;
  };
  try {
    return visit(root, "");
  } catch {
    return 0;
  }
}

import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
