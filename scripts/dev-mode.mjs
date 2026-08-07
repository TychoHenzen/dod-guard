#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const INSTALLED = join(homedir(), ".claude", "plugins", "installed_plugins.json");
const MONO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const MARKETPLACE = "dod-guard";
const PLUGINS = ["dod-guard", "evomcp", "gitevo", "obsidian-rag", "quality-guard"];

const data = JSON.parse(readFileSync(INSTALLED, "utf-8"));
let changed = 0;
let skipped = 0;

for (const name of PLUGINS) {
  const key = `${name}@${MARKETPLACE}`;
  const entries = data.plugins?.[key];
  if (!entries?.length) {
    process.stderr.write(`skip: ${key} not installed\n`);
    continue;
  }

  const sourcePath = join(MONO_ROOT, "packages", name);
  for (const entry of entries) {
    if (entry.installPath === sourcePath) {
      skipped++;
      process.stderr.write(`already source: ${key}\n`);
      continue;
    }
    entry.installPath = sourcePath;
    changed++;
    process.stderr.write(`redirected: ${key} -> packages/${name}/\n`);
  }
}

if (changed === 0) {
  process.stderr.write(skipped > 0 ? "\nAll plugins already point at source.\n" : "\nNothing to do.\n");
  process.exit(0);
}

writeFileSync(INSTALLED, JSON.stringify(data, null, 2) + "\n");
process.stderr.write(`\nDone. ${changed} plugin(s) redirected to source.\nRestart Claude Code or run /reload-plugins.\n`);
