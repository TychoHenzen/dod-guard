import { posix, win32 } from "node:path";

export function samePath(
  left: string,
  right: string,
  platform: "posix" | "win32",
): boolean {
  if (platform === "posix") return left === right;
  return (
    win32.normalize(left).toLowerCase() === win32.normalize(right).toLowerCase()
  );
}

export function isWithin(
  root: string,
  candidate: string,
  platform: "posix" | "win32",
): boolean {
  const path = platform === "win32" ? win32 : posix;
  const relativePath = path.relative(
    path.resolve(root),
    path.resolve(candidate),
  );
  return relativePath === "" || isChildPath(relativePath, path.sep, path);
}

function isChildPath(
  relativePath: string,
  separator: string,
  path: typeof posix,
): boolean {
  return (
    !relativePath.startsWith(`..${separator}`) &&
    relativePath !== ".." &&
    !path.isAbsolute(relativePath)
  );
}

export function basename(value: string, platform: "posix" | "win32"): string {
  return (platform === "win32" ? win32 : posix).basename(value);
}

export function platformForHost(): "posix" | "win32" {
  return process.platform === "win32" ? "win32" : "posix";
}

export function isPermittedEndpoint(endpoint: string): boolean {
  if (endpoint === "stdio") return true;
  try {
    const url = new URL(endpoint);
    return localHost(url.hostname);
  } catch {
    return false;
  }
}

function localHost(hostname: string): boolean {
  return (
    /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}
