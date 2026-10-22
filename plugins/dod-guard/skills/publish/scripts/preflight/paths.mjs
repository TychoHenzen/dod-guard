import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute, normalize, parse, relative, resolve, sep } from "node:path";
import process from "node:process";

// Windows extended-length prefix that realpath can return; stripped before comparing paths.
const longPathPrefix = /^\\\\\?\\/;

export function absoluteInstallPath(value) {
  return (
    typeof value === "string" && isAbsolute(value) && (process.platform !== "win32" || parse(value).root.length > 1)
  );
}

export function normalizedPath(value) {
  const absolute = normalize(resolve(value)).replace(longPathPrefix, "");
  return process.platform === "win32" ? absolute.toLocaleLowerCase("en-US") : absolute;
}

export function isInside(parent, child) {
  const remainder = relative(parent, child);
  return remainder === "" || (remainder !== ".." && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder));
}

export async function readRegularFile(path) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!(await file.stat()).isFile()) throw new Error("path is not a regular file");
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}
