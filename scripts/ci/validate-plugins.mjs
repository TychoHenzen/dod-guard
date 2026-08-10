#!/usr/bin/env node
// validate-plugins — structural validation of Claude Code plugin configuration.
//
// Checks the things npm and tsc cannot: that plugin.json / .mcp.json /
// marketplace.json agree with each other, with package.json, and with the files
// that actually exist on disk — plus the repo-wide content rules (every JSON
// parses, nothing ships a credential or a developer's home directory, and
// everything a plugin needs is tracked by git).
//
// Exit codes:
//   0  everything consistent
//   1  violations found
//   3  usage error

import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkGitTracked,
  checkJsonSyntax,
  checkOrphanPluginContent,
  checkShippedContent,
} from "./lib/content-checks.mjs";
import { listDir } from "./lib/fs-utils.mjs";
import { createPluginChecks } from "./lib/plugin-checks.mjs";
import { checkStandalonePlugins, loadStandalonePlugins } from "./lib/standalone-checks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGES_DIR = join(ROOT, "packages");

const violations = [];

function report(file, message) {
  violations.push({ file: relative(ROOT, file).replace(/\\/g, "/") || ".", message });
}

function loadPackages() {
  return listDir(PACKAGES_DIR, (p) => statSync(p).isDirectory())
    .map((name) => {
      const dir = join(PACKAGES_DIR, name);
      return {
        name,
        dir,
        skills: listDir(join(dir, "skills"), (p) => statSync(p).isDirectory()),
        agents: listDir(join(dir, "agents"), (p) => p.endsWith(".md")).map((f) => basename(f, ".md")),
      };
    })
    .filter((pkg) => existsSync(join(pkg.dir, "package.json")));
}

function main() {
  const packages = loadPackages();
  const standalone = loadStandalonePlugins(ROOT);
  if (packages.length === 0) {
    process.stderr.write("no packages found under packages/\n");
    return 3;
  }

  const { checkPackage, checkMarketplace } = createPluginChecks(report);
  for (const pkg of packages) checkPackage(pkg, packages);
  checkMarketplace(join(ROOT, ".claude-plugin", "marketplace.json"), packages, true);

  const styleCount = checkStandalonePlugins(standalone, report);
  const jsonCount = checkJsonSyntax(ROOT, report);
  checkOrphanPluginContent(ROOT, report);
  const contentCount = checkShippedContent(ROOT, report);
  checkGitTracked(ROOT, [...packages, ...standalone], report);

  const skillCount = packages.reduce((n, p) => n + p.skills.length, 0);
  const agentCount = packages.reduce((n, p) => n + p.agents.length, 0);
  const pluginCount = packages.length + standalone.length;
  const scanned = `${pluginCount} plugins, ${skillCount} skills, ${agentCount} agents, ${styleCount} output styles, ${jsonCount} JSON files, ${contentCount} shipped docs`;
  if (violations.length === 0) {
    process.stdout.write(`plugin configuration OK — ${scanned}\n`);
    return 0;
  }
  process.stdout.write(`plugin configuration FAILED — ${violations.length} violation(s) across ${scanned}\n\n`);
  for (const v of violations) process.stdout.write(`  ${v.file}\n    ${v.message}\n`);
  return 1;
}

process.exitCode = main();
