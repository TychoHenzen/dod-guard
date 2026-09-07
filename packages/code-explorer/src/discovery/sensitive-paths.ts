const keyFile = /^id_(rsa|dsa|ecdsa|ed25519)$/iu;
const credentialFile = /^\.(npmrc|pypirc)$|^nuget\.config$/iu;

/** Non-overridable portable sensitive-path denylist. It deliberately has no
 * path-returning API.
 */
export function isSensitiveProjectPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (unsafeSensitivePath(normalized)) return true;
  const parts = normalized.split("/");
  const file = parts.at(-1) ?? "";
  return sensitiveDirectory(parts) || sensitiveFile(file);
}

function unsafeSensitivePath(path: string): boolean {
  return (
    !path ||
    path.startsWith("/") ||
    path.split("/").some((part) => part === "..")
  );
}

function sensitiveDirectory(parts: readonly string[]): boolean {
  return parts.some((part) => /^(\.git|\.hg|\.svn)$/iu.test(part));
}

function sensitiveFile(file: string): boolean {
  return (
    /^\.env(?:\..+)?$/iu.test(file) ||
    /\.(pem|key|pfx|p12)$/iu.test(file) ||
    keyFile.test(file) ||
    credentialFile.test(file)
  );
}

/** Walks names only and never returns a denied path. */
export function countSensitivePathsUnderRoot(root: string): number {
  const visit = (directory: string, relativeDirectory: string): number => {
    let count = 0;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      count += visitEntry({ directory, relativePath, entry, visit });
    }
    return count;
  };
  try {
    return visit(root, "");
  } catch {
    return 0;
  }
}

function visitEntry(options: {
  directory: string;
  relativePath: string;
  entry: import("node:fs").Dirent;
  visit: (directory: string, relativeDirectory: string) => number;
}): number {
  const { directory, relativePath, entry, visit } = options;
  if (isSensitiveProjectPath(relativePath)) return 1;
  const absolute = join(directory, entry.name);
  if (!entry.isDirectory() || lstatSync(absolute).isSymbolicLink()) return 0;
  return visit(absolute, relativePath);
}

import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
