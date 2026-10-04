#!/usr/bin/env node
// check-tests-present — report source files that have no test file.
//
// Coverage percentage hides untested modules behind well-tested ones. This
// checks the cruder thing coverage cannot: does a test file directly name or
// statically reach <name>.ts at all. This is evidence only: it never compares,
// writes, or fails on a number.
//
// Usage: node scripts/ci/check-tests-present.mjs
//
// Exit codes:
//   0  report completed or was unavailable
//   3  usage error

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Type-only and constant-only modules have no behavior worth asserting.
const EXEMPT = new Set(["types.ts", "constants.ts", "index.ts"]);
const TEST_SUFFIX = ".test.ts";
const AGGREGATE_DECLARATION = /^\s*\/\/\s*test-sources:\s*(.+)$/gm;

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * A test file for `foo.ts` is `foo.test.ts`, or `foo.<qualifier>.test.ts` for a
 * suite that tests the module some other way. `index.characterization.test.ts`
 * drives `index.ts` through its own protocol rather than by import, and that is
 * coverage the plain name cannot express.
 */
function hasMatchingTestFileIn(file, dir) {
  const stem = file.slice(0, -".ts".length);
  const prefix = `${stem.split(/[/\\]/).pop()}.`;
  return readdirSync(dir).some((entry) => {
    if (!(entry.startsWith(prefix) && entry.endsWith(TEST_SUFFIX))) return false;
    return existsSync(join(dir, entry));
  });
}

function hasTestFile(file) {
  return hasMatchingTestFileIn(file, dirname(file)) || hasCentralTestFile(file);
}

function sourceRootFor(file) {
  const parts = relative(ROOT, file).split(sep);
  if (parts[0] === "packages" && parts[1]) return join(ROOT, "packages", parts[1]);
  const sourceMarker = `${sep}src${sep}`;
  return file.slice(0, file.indexOf(sourceMarker));
}

function sourceAreaFor(file) {
  const sourceRoot = sourceRootFor(file);
  return relative(join(sourceRoot, "src"), file).split(/[\\/]/)[0];
}

function centralTestDirectory(file) {
  return join(sourceRootFor(file), "src", "testing", sourceAreaFor(file));
}

function hasCentralTestFile(file) {
  const centralDir = centralTestDirectory(file);
  return existsSync(centralDir) && hasMatchingTestFileIn(file, centralDir);
}

function centralTestAreaFor(file) {
  const parts = relative(join(sourceRootFor(file), "src"), file).split(/[\\/]/);
  return parts[0] === "testing" ? parts[1] : undefined;
}

function canCentralTestReach(file, area) {
  return area === undefined || sourceAreaFor(file) === "testing" || sourceAreaFor(file) === area;
}

function importSpecifiers(file) {
  const source = readFileSync(file, "utf8");
  const specifiers = [];
  const patterns = [/(?:from|import)\s*["']([^"']+)["']/g, /import\s*\(\s*["']([^"']+)["']\s*\)/g];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

function sourceImportPath(file, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const target = resolve(dirname(file), specifier);
  const candidates = target.endsWith(".js")
    ? [`${target.slice(0, -".js".length)}.ts`]
    : [target, `${target}.ts`, join(target, "index.ts")];
  return candidates.find((candidate) => existsSync(candidate) && candidate.endsWith(".ts"));
}

function aggregateTests(files) {
  return files.flatMap((file) => {
    if (!file.endsWith(TEST_SUFFIX)) return [];
    const source = readFileSync(file, "utf8");
    AGGREGATE_DECLARATION.lastIndex = 0;
    return [...source.matchAll(AGGREGATE_DECLARATION)].flatMap((match) => {
      const targets = match[1]
        .split(/[\s,]+/)
        .map((specifier) => sourceImportPath(file, specifier))
        .filter((target) => target && !target.endsWith(TEST_SUFFIX));
      return targets.length > 0 ? [{ file, area: undefined, targets: new Set(targets) }] : [];
    });
  });
}

function testedSources(sourceFiles, testFiles) {
  const files = [...sourceFiles, ...testFiles];
  const directlyTested = sourceFiles.filter((file) => hasCentralTestFile(file));
  const queue = [];
  const aggregateReachable = new Set();
  const tested = new Set(directlyTested);
  for (const file of sourceFiles) {
    const area = centralTestAreaFor(file);
    if (area && file.endsWith(TEST_SUFFIX)) queue.push({ file, area });
  }
  for (const file of testFiles) {
    if (file.endsWith(TEST_SUFFIX)) queue.push({ file, area: undefined });
  }
  for (const entry of aggregateTests(files)) {
    for (const target of entry.targets ?? []) tested.add(target);
    queue.push(entry);
  }
  for (const file of directlyTested) queue.push({ file, area: sourceAreaFor(file) });
  const visited = new Set();
  while (queue.length > 0) {
    const entry = queue.pop();
    const { file, area } = entry;
    const visitKey = `${file}:${area}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    for (const specifier of importSpecifiers(file)) {
      const imported = sourceImportPath(file, specifier);
      if (!imported || imported.endsWith(".d.ts")) continue;
      if (entry.targets?.has(imported)) aggregateReachable.add(imported);
      if (imported.endsWith(TEST_SUFFIX)) queue.push({ file: imported, area, targets: entry.targets });
      else if (canCentralTestReach(imported, area)) {
        if (!entry.targets) tested.add(imported);
        queue.push({ file: imported, area, targets: entry.targets });
      }
    }
  }
  for (const file of aggregateReachable) tested.add(file);
  return tested;
}

function untestedSources() {
  const packagesDir = join(ROOT, "packages");
  const gaps = [];
  for (const pkg of readdirSync(packagesDir)) {
    const sourceFiles = walk(join(packagesDir, pkg, "src"));
    const testFiles = walk(join(packagesDir, pkg, "tests"));
    const tested = testedSources(sourceFiles, testFiles);
    for (const file of sourceFiles) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts") || file.endsWith(".d.ts")) continue;
      if (EXEMPT.has(file.split(/[/\\]/).pop())) continue;
      if (hasTestFile(file) || tested.has(file)) continue;
      gaps.push(relative(ROOT, file).split("\\").join("/"));
    }
  }
  return gaps.sort();
}

function main(argv) {
  if (argv.length > 0) {
    process.stderr.write(`unknown option: ${argv[0]}\nusage: check-tests-present.mjs\n`);
    return 3;
  }
  const current = untestedSources();
  process.stdout.write(`test presence advisory — ${current.length} source file(s) without matching tests\n`);
  for (const file of current) process.stdout.write(`  ${file} has no ${file.replace(/\.ts$/, ".test.ts")}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
