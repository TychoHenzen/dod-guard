#!/usr/bin/env node
// check-pack — verify what npm would actually publish for a package.
//
// A plugin that builds, tests and lints cleanly can still ship broken: a skill
// directory left out of package.json "files", a hook script that never makes it
// into the tarball, or node_modules accidentally swept in. This inspects the
// real `npm pack` file list.
//
// Usage: node scripts/ci/check-pack.mjs <package-name>
//
// Exit codes:
//   0  tarball contents correct
//   1  contents wrong
//   3  usage error

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAX_UNPACKED_BYTES = 8 * 1024 * 1024;
const MIN_BUNDLE_BYTES = 10 * 1024;
// Shipping these means the "files" allowlist leaked — they bloat every install.
const FORBIDDEN = [/^node_modules\//, /^coverage\//, /^src\//, /\.test\.(ts|js)$/, /^dist\/(?!bundle\.js$)/];

function listFilesUnder(dir, base) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFilesUnder(full, base));
    else out.push(relative(base, full).split("\\").join(posix.sep));
  }
  return out;
}

function packFileList(pkgName) {
  const raw = execFileSync("npm", ["pack", "--dry-run", "--json", "-w", `packages/${pkgName}`], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const report = JSON.parse(raw)[0];
  return {
    files: new Map(report.files.map((f) => [f.path, f.size])),
    unpackedSize: report.unpackedSize,
    entryCount: report.entryCount,
  };
}

/** Every hook command file the plugin declares must survive packing. */
function hookTargets(pkgDir) {
  const pluginJson = join(pkgDir, ".claude-plugin", "plugin.json");
  if (!existsSync(pluginJson)) return [];
  const text = readFileSync(pluginJson, "utf8");
  return [...text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"'\s\\]+)/g)].map((m) => m[1]);
}

function requiredPaths(pkgDir) {
  return [
    "package.json",
    "dist/bundle.js",
    ".mcp.json",
    ".claude-plugin/plugin.json",
    ...listFilesUnder(join(pkgDir, "skills"), pkgDir),
    ...listFilesUnder(join(pkgDir, "agents"), pkgDir),
    ...hookTargets(pkgDir),
  ];
}

function main(argv) {
  const pkgName = argv[0];
  if (!pkgName) {
    process.stderr.write("usage: check-pack.mjs <package-name>\n");
    return 3;
  }
  const pkgDir = join(ROOT, "packages", pkgName);
  if (!existsSync(pkgDir)) {
    process.stderr.write(`no such package: ${pkgName}\n`);
    return 3;
  }

  const pack = packFileList(pkgName);
  const problems = [];

  for (const required of new Set(requiredPaths(pkgDir))) {
    if (!pack.files.has(required)) problems.push(`missing from tarball: ${required}`);
  }
  for (const [path] of pack.files) {
    const banned = FORBIDDEN.find((pattern) => pattern.test(path));
    if (banned) problems.push(`should not be published: ${path}`);
  }
  const bundleSize = pack.files.get("dist/bundle.js") ?? 0;
  if (bundleSize < MIN_BUNDLE_BYTES)
    problems.push(`dist/bundle.js is ${bundleSize} bytes — build did not run or produced a stub`);
  if (pack.unpackedSize > MAX_UNPACKED_BYTES) {
    problems.push(
      `unpacked size ${(pack.unpackedSize / 1024 / 1024).toFixed(1)} MB exceeds ${MAX_UNPACKED_BYTES / 1024 / 1024} MB cap`,
    );
  }

  const stats = `${pack.entryCount} files, ${(pack.unpackedSize / 1024).toFixed(0)} KB unpacked`;
  if (problems.length === 0) {
    process.stdout.write(`pack contents OK for ${pkgName} — ${stats}\n`);
    return 0;
  }
  process.stdout.write(`pack contents FAILED for ${pkgName} — ${stats}\n\n`);
  for (const problem of problems) process.stdout.write(`  ${problem}\n`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
