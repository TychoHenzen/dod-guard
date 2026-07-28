#!/usr/bin/env node
// detect-releases — decide which packages this commit should publish.
//
// The trigger is package.json itself: a version that is not on the registry is
// a release, everything else is already out. No tag to create by hand, no
// commit-message convention to typo, and no way for a tag and a version to
// disagree. CI creates the <package>-v<version> tag after a successful publish,
// so tags become a record of what shipped rather than the instruction to ship.
//
// Writes `releases=["pkg", ...]` to GITHUB_OUTPUT when running under Actions.
//
// Exit codes:
//   0  detection completed (releasing or not)
//   1  a package is unpublishable (bad version, registry unreachable)

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGES_DIR = join(ROOT, "packages");

/** Versions already on npm. `null` means the registry could not be reached. */
function publishedVersions(pkgName) {
  try {
    const raw = execFileSync("npm", ["view", pkgName, "versions", "--json"], {
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    // A package that has never been published returns E404 — that is not a failure.
    const output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (output.includes("E404") || output.includes("404 Not Found")) return [];
    return null;
  }
}

function loadPackages() {
  return readdirSync(PACKAGES_DIR)
    .filter((name) => statSync(join(PACKAGES_DIR, name)).isDirectory())
    .filter((name) => existsSync(join(PACKAGES_DIR, name, "package.json")))
    .map((name) => ({ name, manifest: JSON.parse(readFileSync(join(PACKAGES_DIR, name, "package.json"), "utf8")) }));
}

function main() {
  const releases = [];
  const problems = [];
  const lines = [];

  for (const { name, manifest } of loadPackages()) {
    if (manifest.private) {
      lines.push(`  ${name}: private, never published`);
      continue;
    }
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) {
      problems.push(`${name}: version must be x.y.z, got ${JSON.stringify(manifest.version)}`);
      continue;
    }
    const published = publishedVersions(manifest.name);
    if (published === null) {
      problems.push(`${name}: cannot reach the npm registry — refusing to guess whether ${manifest.version} is new`);
      continue;
    }
    if (published.includes(manifest.version)) {
      lines.push(`  ${name}: ${manifest.version} already on npm — skip`);
    } else {
      lines.push(`  ${name}: ${manifest.version} is new (latest published: ${published.at(-1) ?? "none"}) — RELEASE`);
      releases.push(name);
    }
  }

  process.stdout.write(`${lines.join("\n")}\n`);
  if (problems.length > 0) {
    process.stdout.write(`\ndetection FAILED\n`);
    for (const problem of problems) process.stdout.write(`  ${problem}\n`);
    return 1;
  }
  process.stdout.write(
    releases.length > 0 ? `\nreleasing: ${releases.join(", ")}\n` : "\nnothing to release this push\n",
  );

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `releases=${JSON.stringify(releases)}\n`);
  }
  return 0;
}

process.exitCode = main();
