import { mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

/** The start sweep reads TEMP, TMP and TMPDIR, so each bundle child gets its own. */
export function isolatedTempEnvironment(root: string): Record<string, string> {
  const tmp = join(root, "tmp");
  mkdirSync(tmp, { recursive: true });
  return { TEMP: tmp, TMP: tmp, TMPDIR: tmp };
}

/**
 * Empty homes and tool roots, so adapter selection cannot find a backend the
 * host has installed. PATH is left to the caller.
 */
export function isolatedDiscoveryEnvironment(
  root: string,
): Record<string, string> {
  const home = join(root, "home");
  const empty = join(root, "empty");
  mkdirSync(home, { recursive: true });
  mkdirSync(empty, { recursive: true });
  return {
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, "AppData"),
    PROGRAMFILES: empty,
    CARGO_HOME: empty,
    CODE_EXPLORER_BACKENDS_ROOT: empty,
    ...isolatedTempEnvironment(root),
  };
}

export function isolatedBackendEnvironment(
  root: string,
): Record<string, string> {
  return {
    PATH: "",
    SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot ?? "",
    ...isolatedDiscoveryEnvironment(root),
  };
}
