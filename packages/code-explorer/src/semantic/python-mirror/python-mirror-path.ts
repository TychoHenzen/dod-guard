import { createHash } from "node:crypto";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

export function relativeMirrorPath(
  uri: string,
  mirrorRoot: string,
): string | undefined {
  try {
    if (!uri.startsWith("file:")) return undefined;
    const path = fileURLToPath(uri);
    const relativePath = relative(mirrorRoot, path).replaceAll("\\", "/");
    return validRelativePath(relativePath) ? relativePath : undefined;
  } catch {
    return undefined;
  }
}

function validRelativePath(value: string): boolean {
  return value.length > 0 && !value.startsWith("../") && value !== "..";
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}
