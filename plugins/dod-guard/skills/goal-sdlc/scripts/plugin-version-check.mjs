// Reads the dod-guard version this run loaded and the version published on the default branch, and says
// whether the loaded copy is current. The loaded copy is the plugin root this file sits in: a client can load a
// skill from an old cache directory while its registration names the new release, so a registration check
// would pass. A stale copy is reported, never refreshed here, because only the user refreshes a client.

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "../../../lib/args.mjs";
import { runGh } from "../../complete-pr/scripts/lib/gh-runner.mjs";
import { classifyVersions, refreshCommands } from "./plugin-version.mjs";

const USAGE = `usage: plugin-version-check.mjs --client=claude|codex

Compares the version in the loaded plugin's manifest with the manifest on TychoHenzen/dod-guard master and
prints JSON with status current, ahead, stale or unreadable. Exit 0 means current or ahead, 1 means stale
(the JSON lists the refresh commands for the user), 3 means a version could not be read, 2 means bad flags.`;

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MANIFEST_DIRS = { claude: ".claude-plugin", codex: ".codex-plugin" };
const PUBLISHED_ROOT = "repos/TychoHenzen/dod-guard/contents/plugins/dod-guard";
const RAW_ACCEPT = "Accept: application/vnd.github.raw+json";
const EXIT_CODES = { current: 0, ahead: 0, stale: 1, unreadable: 3 };
const USAGE_EXIT = 2;

function versionOf(text) {
  const { version } = JSON.parse(text);
  if (typeof version !== "string") {
    throw new Error("manifest has no version string");
  }
  return version;
}

// A failed read becomes a problem line, so the verdict is unreadable instead of an exception.
function attempt(read) {
  try {
    return { version: read(), problem: null };
  } catch (error) {
    return { version: null, problem: String(error?.message ?? error) };
  }
}

function refreshFor(status, client) {
  if (status !== "stale") {
    return [];
  }
  return refreshCommands(client);
}

function checkPluginVersion({ client, root = PLUGIN_ROOT }, io = { run: runGh, read: readFileSync }) {
  const manifest = `${MANIFEST_DIRS[client]}/plugin.json`;
  const installed = attempt(() => versionOf(io.read(path.join(root, manifest), "utf8")));
  const published = attempt(() => versionOf(io.run(["api", "-H", RAW_ACCEPT, `${PUBLISHED_ROOT}/${manifest}`]).stdout));
  const status = classifyVersions(installed.version, published.version);
  return {
    client,
    installed: installed.version,
    published: published.version,
    status,
    problems: [installed.problem, published.problem].filter(Boolean),
    refresh: refreshFor(status, client),
    exitCode: EXIT_CODES[status],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Object.hasOwn(MANIFEST_DIRS, args?.client)) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = USAGE_EXIT;
    return;
  }
  const result = checkPluginVersion({ client: args.client });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.exitCode;
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (import.meta.url === invoked) {
  main();
}

export { checkPluginVersion };
