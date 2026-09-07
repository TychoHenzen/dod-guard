#!/usr/bin/env node
// check-tests-present — ratchet on source files that have no test file.
//
// Coverage percentage hides untested modules behind well-tested ones. This
// checks the cruder thing coverage cannot: does a test file directly name or
// statically reach <name>.ts at all. Existing gaps are allowed via the baseline;
// a NEW untested file
// fails. Files that gain tests are dropped from the baseline so the gap can
// only shrink.
//
// Usage: node scripts/ci/check-tests-present.mjs [--write-baseline]
//
// Exit codes:
//   0  no new untested source files
//   1  new untested source files
//   3  usage error

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = join(ROOT, ".github", "quality", "untested-sources.txt");
// Type-only and constant-only modules have no behavior worth asserting.
const EXEMPT = new Set(["types.ts", "constants.ts", "index.ts"]);
const TEST_SUFFIX = ".test.ts";

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
  return sourceAreaFor(file) === "testing" || sourceAreaFor(file) === area;
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

function testedSources(files) {
  const directlyTested = files.filter((file) => !file.endsWith(TEST_SUFFIX) && hasCentralTestFile(file));
  const queue = [];
  for (const file of files) {
    const area = centralTestAreaFor(file);
    if (area && file.endsWith(TEST_SUFFIX)) queue.push({ file, area });
  }
  for (const file of directlyTested) queue.push({ file, area: sourceAreaFor(file) });
  const visited = new Set();
  const tested = new Set(directlyTested);
  while (queue.length > 0) {
    const entry = queue.pop();
    const { file, area } = entry;
    const visitKey = `${file}:${area}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    for (const specifier of importSpecifiers(file)) {
      const imported = sourceImportPath(file, specifier);
      if (!imported || imported.endsWith(".d.ts")) continue;
      if (imported.endsWith(TEST_SUFFIX)) queue.push({ file: imported, area });
      else if (canCentralTestReach(imported, area)) {
        tested.add(imported);
        queue.push({ file: imported, area });
      }
    }
  }
  return tested;
}

function untestedSources() {
  const packagesDir = join(ROOT, "packages");
  const gaps = [];
  for (const pkg of readdirSync(packagesDir)) {
    const files = walk(join(packagesDir, pkg, "src"));
    const tested = testedSources(files);
    for (const file of files) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts") || file.endsWith(".d.ts")) continue;
      if (EXEMPT.has(file.split(/[/\\]/).pop())) continue;
      if (hasTestFile(file) || tested.has(file)) continue;
      gaps.push(relative(ROOT, file).split("\\").join("/"));
    }
  }
  return gaps.sort();
}

function readBaseline() {
  if (!existsSync(BASELINE)) return [];
  return readFileSync(BASELINE, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function main(argv) {
  const unknown = argv.filter((a) => a !== "--write-baseline");
  if (unknown.length > 0) {
    process.stderr.write(`unknown option: ${unknown[0]}\nusage: check-tests-present.mjs [--write-baseline]\n`);
    return 3;
  }
  const current = untestedSources();
  if (argv.includes("--write-baseline")) {
    const header =
      "# Source files with no matching or statically reachable .test.ts. Ratcheted by scripts/ci/check-tests-present.mjs.\n# This list may shrink, never grow.\n";
    writeFileSync(BASELINE, `${header}${current.join("\n")}\n`);
    process.stdout.write(`wrote baseline with ${current.length} untested source(s)\n`);
    return 0;
  }

  const allowed = new Set(readBaseline());
  const added = current.filter((file) => !allowed.has(file));
  const fixed = [...allowed].filter((file) => !current.includes(file));

  for (const file of fixed) process.stdout.write(`  fixed: ${file} now has tests\n`);
  if (added.length === 0) {
    process.stdout.write(`test presence OK — ${current.length} known gap(s), 0 new\n`);
    return 0;
  }
  process.stdout.write(`test presence FAILED — ${added.length} source file(s) added without tests\n\n`);
  for (const file of added) process.stdout.write(`  ${file} has no ${file.replace(/\.ts$/, ".test.ts")}\n`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
