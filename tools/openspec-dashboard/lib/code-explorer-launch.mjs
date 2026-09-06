// code-explorer-launch.mjs - locate and import the trusted Code Explorer package.

import { readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { HttpError } from "./http-error.mjs";

const systemFs = { realpath: realpathSync, stat: statSync, readFile: readFileSync };

function unavailable() {
  throw new HttpError(503, "code_explorer_unavailable");
}

function parseMetadata(fs, path) {
  try {
    return JSON.parse(String(fs.readFile(path, "utf8")));
  } catch {
    unavailable();
  }
}

function validateEntry(entry, fs) {
  let canonicalEntry;
  try {
    canonicalEntry = fs.realpath(entry);
    if (!fs.stat(canonicalEntry).isFile()) unavailable();
  } catch {
    unavailable();
  }
  const packageRoot = dirname(dirname(canonicalEntry));
  if (relative(packageRoot, canonicalEntry).replaceAll("\\", "/") !== "dist/bundle.js") unavailable();
  const packageJson = parseMetadata(fs, join(packageRoot, "package.json"));
  const pluginJson = parseMetadata(fs, join(packageRoot, ".claude-plugin", "plugin.json"));
  if (packageJson?.name !== "code-explorer" || packageJson?.main !== "dist/bundle.js" || pluginJson?.name !== "code-explorer") unavailable();
  try {
    if (fs.realpath(join(packageRoot, packageJson.main)) !== canonicalEntry) unavailable();
  } catch {
    unavailable();
  }
  return canonicalEntry;
}

export function discoverCodeExplorer({ monorepoRoot, installedRoot, env = process.env, fs = systemFs }) {
  if (env.CODE_EXPLORER_JS !== undefined) return validateEntry(env.CODE_EXPLORER_JS, fs);
  try {
    return validateEntry(join(monorepoRoot, "packages", "code-explorer", "dist", "bundle.js"), fs);
  } catch {
    const fallbackRoot = installedRoot ?? installedCodeExplorerRoot({ monorepoRoot, env, fs });
    return validateEntry(join(fallbackRoot, "dist", "bundle.js"), fs);
  }
}

export function installedCodeExplorerRoot({ monorepoRoot, env = process.env, fs = systemFs, home = homedir() }) {
  const metadata = parseMetadata(fs, join(monorepoRoot, "packages", "code-explorer", "package.json"));
  if (typeof metadata?.version !== "string" || metadata.version.length === 0) unavailable();
  const codexRoot = env.CODEX_HOME ?? join(home, ".codex");
  return join(codexRoot, "plugins", "cache", "dod-guard-monorepo", "code-explorer", metadata.version);
}

/** Import the bundle without invoking its stdio or standalone browser entry points. */
export async function loadCodeExplorer(entry, { importModule = (url) => import(url) } = {}) {
  try {
    const module = await importModule(pathToFileURL(entry).href);
    if (typeof module.createEmbeddedBrowserRuntime !== "function") unavailable();
    return module.createEmbeddedBrowserRuntime;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    unavailable();
  }
}
