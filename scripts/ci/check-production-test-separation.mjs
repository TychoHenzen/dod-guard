#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const PACKAGES = [
  { name: "code-explorer", productionRoots: ["src", "dist"] },
  { name: "fossil", productionRoots: ["src", "dist"] },
  {
    name: "quality-guard",
    productionRoots: ["src", "dist", "scripts", "skills/quality-refactor/scripts"],
  },
];

const TEST_FILE = /(?:\.test|\.spec|\.cases|\.test-support)\.[^.]+$/iu;

function walk(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function isTestPath(path) {
  const normalized = path.split(sep).join("/");
  const parts = normalized.split("/");
  return (
    TEST_FILE.test(normalized) ||
    parts.includes("testing") ||
    parts.includes("semantic-tests") ||
    parts.includes("target")
  );
}

export function findViolations(root = ROOT) {
  const violations = [];
  for (const { name, productionRoots } of PACKAGES) {
    for (const productionRoot of productionRoots) {
      const absolute = resolve(root, "packages", name, productionRoot);
      if (!existsSync(absolute)) {
        violations.push(`packages/${name}/${productionRoot} is missing`);
        continue;
      }
      for (const file of walk(absolute)) {
        const relativePath = relative(resolve(root, "packages", name), file);
        if (isTestPath(relativePath)) violations.push(`packages/${name}/${relativePath}`);
      }
    }
    const testRoot = resolve(root, "packages", name, "tests");
    if (!walk(testRoot).some((file) => /\.test\.(?:ts|mjs|js)$/iu.test(file))) {
      violations.push(`packages/${name}/tests has no runnable test files`);
    }
  }
  return violations.sort((left, right) => left.localeCompare(right));
}

export function main(root = ROOT) {
  const violations = findViolations(root);
  if (violations.length === 0) {
    process.stdout.write("production-test separation OK - 3 packages, 0 violations\n");
    return 0;
  }
  process.stdout.write(`production-test separation FAILED - ${violations.length} violation(s)\n`);
  for (const violation of violations) process.stdout.write(`  ${violation}\n`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
