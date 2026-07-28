#!/usr/bin/env node
// check-release — validate the release tags that are about to trigger a publish.
//
// CI publishes whatever `npm publish` finds in package.json, but decides WHICH
// package to publish from the git tag. If the two disagree, the wrong version
// ships under the right tag and nobody notices until users report a stale
// plugin. This makes that disagreement a build failure.
//
// Usage: node scripts/ci/check-release.mjs "<tag>[,<tag>...]" [--registry]
//   --registry  also assert the version is not already on npm
//
// Exit codes:
//   0  tags consistent with package.json (and unpublished, with --registry)
//   1  inconsistent
//   3  usage error

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TAG_PATTERN = /^(.+)-v(\d+\.\d+\.\d+(?:-[\w.]+)?)$/;

function publishedVersions(pkgName) {
  try {
    const raw = execFileSync("npm", ["view", pkgName, "versions", "--json"], {
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return []; // package not published yet — every version is new
  }
}

function checkTag(tag, useRegistry) {
  const match = TAG_PATTERN.exec(tag);
  if (!match) return [`tag "${tag}" is not <package>-v<x.y.z>`];
  const [, pkgName, version] = match;
  const manifestPath = join(ROOT, "packages", pkgName, "package.json");
  if (!existsSync(manifestPath))
    return [`tag "${tag}" names package "${pkgName}" which does not exist under packages/`];

  const problems = [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== version) {
    problems.push(
      `tag "${tag}" would publish ${pkgName}@${manifest.version} — bump package.json to ${version} or retag`,
    );
  }
  if (manifest.private) problems.push(`${pkgName} is marked private and cannot be published`);
  if (useRegistry && publishedVersions(pkgName).includes(manifest.version)) {
    problems.push(`${pkgName}@${manifest.version} is already on npm — publish would fail with E403`);
  }
  return problems;
}

function main(argv) {
  const useRegistry = argv.includes("--registry");
  const tags = (argv.find((a) => !a.startsWith("--")) ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length === 0) {
    process.stderr.write('usage: check-release.mjs "<tag>[,<tag>...]" [--registry]\n');
    return 3;
  }

  const problems = tags.flatMap((tag) => checkTag(tag, useRegistry));
  if (problems.length === 0) {
    process.stdout.write(`release tags OK — ${tags.join(", ")}\n`);
    return 0;
  }
  process.stdout.write(`release tags FAILED\n\n`);
  for (const problem of problems) process.stdout.write(`  ${problem}\n`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
