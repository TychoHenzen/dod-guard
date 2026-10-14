import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BIOME = JSON.parse(readFileSync(join(ROOT, "biome.json"), "utf8"));
const BIOME_CLI = join(ROOT, "node_modules", "@biomejs", "biome", "bin", "biome");
const PLUGIN_GLOBS = ["plugins/**/*.mjs", "plugins/**/*.js"];
const PROBE = "plugins/dod-guard/scope-probe.mjs";
const IMPORTS = "plugins/dod-guard/scope-imports.mjs";
// Biome prints Windows paths with backslashes, so both separators must match.
const PROBE_NAME = /plugins[\\/]dod-guard[\\/]scope-probe\.mjs/;
const IMPORTS_NAME = /plugins[\\/]dod-guard[\\/]scope-imports\.mjs/;
const MISFORMATTED = "export const value = {a:1}\n";
// Format-clean on purpose: the organizer must be the only reason check fails on this file.
const UNSORTED = [
  'import { join } from "node:path";',
  'import { readFileSync } from "node:fs";',
  "",
  'export const read = (root) => readFileSync(join(root, "probe.txt"), "utf8");',
  "",
].join("\n");

function writeFixture(root, relativePath, content) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function runBiome(root, args) {
  const result = spawnSync(process.execPath, [BIOME_CLI, ...args, "--colors=off"], { cwd: root, encoding: "utf8" });
  assert.equal(result.error, undefined, `biome ${args.join(" ")} failed to start: ${result.error?.message}`);
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test("biome.json puts plugin scripts under the formatter and the import organizer at the root width", () => {
  for (const glob of PLUGIN_GLOBS) {
    assert.ok(BIOME.formatter.includes.includes(glob), `formatter.includes lacks ${glob}`);
    assert.ok(BIOME.assist.includes.includes(glob), `assist.includes lacks ${glob}`);
  }
  assert.equal(BIOME.formatter.lineWidth, 120);
  const pluginWidth = BIOME.overrides.filter(
    ({ includes = [], formatter }) =>
      formatter?.lineWidth !== undefined && includes.some((path) => path.startsWith("plugins/")),
  );
  assert.deepEqual(pluginWidth, [], "an override sets a lineWidth for plugins/");
});

test("Biome flags a misformatted or import-unsorted plugin script, and the write command recovers both", () => {
  const parent = mkdtempSync(join(tmpdir(), "plugin-format-scope-"));
  const root = join(parent, "repo");
  mkdirSync(root);
  try {
    cpSync(join(ROOT, "biome.json"), join(root, "biome.json"));
    writeFixture(root, PROBE, MISFORMATTED);
    writeFixture(root, IMPORTS, UNSORTED);

    const format = runBiome(root, ["format", "plugins"]);
    assert.notEqual(format.status, 0, `format passed a misformatted plugin script:\n${format.output}`);
    assert.match(format.output, PROBE_NAME);
    assert.match(format.output, /Formatter would have printed/);
    assert.doesNotMatch(format.output, IMPORTS_NAME, "the import probe must be format-clean");
    assert.doesNotMatch(format.output, /provided but ignored/);

    const organize = runBiome(root, ["check", IMPORTS, "--linter-enabled=false"]);
    assert.notEqual(organize.status, 0, `check passed an import-unsorted plugin script:\n${organize.output}`);
    assert.match(organize.output, IMPORTS_NAME);
    assert.match(organize.output, /assist\/source\/organizeImports/);
    assert.doesNotMatch(organize.output, /provided but ignored/);

    const write = runBiome(root, ["check", "plugins", "--write", "--linter-enabled=false"]);
    assert.equal(write.status, 0, `the write command failed:\n${write.output}`);
    assert.notEqual(readFileSync(join(root, PROBE), "utf8"), MISFORMATTED, "the probe was not reformatted");
    assert.notEqual(readFileSync(join(root, IMPORTS), "utf8"), UNSORTED, "the imports were not sorted");

    const formatAfter = runBiome(root, ["format", "plugins"]);
    assert.equal(formatAfter.status, 0, `format still fails after the write:\n${formatAfter.output}`);
    const checkAfter = runBiome(root, ["check", "plugins", "--linter-enabled=false"]);
    assert.equal(checkAfter.status, 0, `check still fails after the write:\n${checkAfter.output}`);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
