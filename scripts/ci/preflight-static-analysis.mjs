#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { npmCommand } from "./npm-command.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const QUALITY_SCAN = "packages/quality-guard/skills/quality-refactor/scripts/quality-scan.mjs";
const QUALITY_RULES = [
  "file-length",
  "function-length",
  "complexity",
  "param-count",
  "nesting-depth",
  "types-per-file",
  "duplicate-block",
  "else-branch",
  "unnamed-tuple",
  "dead-export",
  "unused-local",
  "test-only-export",
  "commented-out-code",
  "todo-marker",
  "stateless-method",
  "comment-bloat",
  "comment-restates-code",
  "comment-metadata",
  "comment-placeholder",
  "comment-missing-reference",
  "output-parameter",
  "flag-parameter",
  "wildcard-import",
  "naming-encoding",
  "assumption-marker",
].join(",");
const QUALITY_PATH_ARGS = ["packages", "--exclude=/dist/", "--exclude=/dist-test/", "--exclude=node_modules"];

function run(command, args, { name, allowFailure = false, env = process.env, shell = false } = {}) {
  process.stdout.write(`\n> ${name}\n`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env,
    shell,
    windowsHide: true,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    throw new Error(`${name} could not start: ${result.error.message}`);
  }
  const status = result.status ?? 1;
  if (status !== 0 && !allowFailure) {
    throw new Error(`${name} exited with status ${status}`);
  }
  return { status, stdout: result.stdout ?? "" };
}

function runNpm(name, args) {
  const command = npmCommand(args);
  return run(command.command, command.args, { name, shell: command.shell });
}

function runNode(name, script, args, options = {}) {
  return run(process.execPath, [script, ...args], { name, ...options });
}

function gitPaths(args) {
  const result = spawnSync("git", ["-c", "core.fileMode=false", ...args], { cwd: ROOT });
  if (result.error) {
    throw new Error(`git ${args[0]} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} exited with status ${result.status}`);
  }
  return result.stdout.toString("utf8").split("\0").filter(Boolean);
}

function changedPaths() {
  return [
    ...new Set([
      ...gitPaths(["diff", "--no-renames", "--name-only", "-z", "HEAD", "--"]),
      ...gitPaths(["ls-files", "--others", "--exclude-standard", "-z"]),
    ]),
  ].sort();
}

function reportPaths(title, paths) {
  process.stderr.write(`${title}\n`);
  for (const changedPath of paths) {
    process.stderr.write(`  ${JSON.stringify(changedPath)}\n`);
  }
}

function fetchQualityDecisionNotes() {
  const result = spawnSync("git", ["fetch", "origin", "refs/notes/quality-decisions:refs/notes/quality-decisions"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.status === 0) return;
  if (result.stderr?.includes("couldn't find remote ref refs/notes/quality-decisions")) {
    process.stdout.write("No quality decision notes ref is published for this repository.\n");
    return;
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  throw new Error(`fetch quality decision notes exited with status ${result.status ?? "unknown"}`);
}

function runQualityRatchet(failures) {
  const env = { ...process.env, QUALITY_RULES, QUALITY_SCAN };
  const qualityArgs = [
    ...QUALITY_PATH_ARGS,
    "--profile=strict",
    `--rules=${QUALITY_RULES}`,
    "--baseline=.github/quality/quality-baseline.json",
    "--fail-on=regression",
  ];
  const quality = runNode("Quality ratchet", QUALITY_SCAN, qualityArgs, { allowFailure: true, env });
  if (quality.status !== 0) failures.push("structural-quality");
  else if (!quality.stdout.includes("Improvements: 0 ")) {
    runNode(
      "Tighten quality baseline",
      QUALITY_SCAN,
      [
        ...QUALITY_PATH_ARGS,
        "--profile=strict",
        `--rules=${QUALITY_RULES}`,
        "--write-baseline=.github/quality/quality-baseline.json",
      ],
      { env },
    );
  }
}

function runTestPresenceRatchet(failures) {
  const testPresence = runNode("Test presence ratchet", "scripts/ci/check-tests-present.mjs", [], {
    allowFailure: true,
  });
  if (testPresence.status !== 0) failures.push("test-presence");
  else if (testPresence.stdout.includes("fixed:")) {
    runNode("Tighten test presence baseline", "scripts/ci/check-tests-present.mjs", ["--write-baseline"], {
      allowFailure: true,
    });
  }
}

function runAdvisoryRatchet(failures) {
  const audit = runNode("Advisory ratchet", "scripts/ci/check-audit.mjs", [], { allowFailure: true });
  if (audit.status !== 0) failures.push("advisories");
  else if (audit.stdout.includes("fixed:")) {
    runNode("Tighten advisory baseline", "scripts/ci/check-audit.mjs", ["--write-baseline"], {
      allowFailure: true,
    });
  }
}

function runCoverageRatchet(failures) {
  const coverage = runNode("Coverage ratchet", "scripts/ci/check-coverage.mjs", [], { allowFailure: true });
  if (coverage.status !== 0) failures.push("coverage");
  else if (/improved:|adopted:/.test(coverage.stdout)) {
    runNode("Tighten coverage baseline", "scripts/ci/check-coverage.mjs", ["--write-baseline"], {
      allowFailure: true,
    });
  }
}

function runRatchets() {
  const failures = [];
  const env = { ...process.env, QUALITY_RULES, QUALITY_SCAN };
  runQualityRatchet(failures);
  fetchQualityDecisionNotes();
  runNode(
    "Committed-tree quality decision",
    "packages/quality-guard/dist/bundle.js",
    ["check", "--committed", "HEAD", "--json"],
    { env: { ...env, QUALITY_GUARD_SKIP_STRUCTURAL: "1" } },
  );
  runTestPresenceRatchet(failures);
  runNode("Unacknowledged quality-gate waivers", "packages/quality-guard/scripts/check-skips.mjs", ["."]);
  runAdvisoryRatchet(failures);
  runCoverageRatchet(failures);
  runNpm("Biome strict check", ["exec", "--", "biome", "check", "--max-diagnostics=200", "--no-errors-on-unmatched"]);
  if (failures.length > 0) {
    throw new Error(`RATCHET FAILED for: ${failures.join(", ")}`);
  }
}

function main() {
  let failed = false;
  try {
    const initialChanges = changedPaths();
    if (initialChanges.length > 0) {
      reportPaths("Preflight requires a clean checkout; existing changes were left untouched:", initialChanges);
      return 1;
    }

    runNpm("Build workspaces", ["run", "build"]);
    runNpm("Bundle workspaces", ["run", "bundle"]);
    runNpm("Reproduce Biome formatting", ["exec", "--", "biome", "format", "--write", "--no-errors-on-unmatched"]);
    run(
      process.execPath,
      ["--test", "scripts/ci/committed-quality-gate.test.mjs", "scripts/ci/preflight-static-analysis.test.mjs"],
      {
        name: "Committed-tree quality decision tests",
      },
    );
    runRatchets();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    failed = true;
  }

  try {
    const changes = changedPaths();
    if (changes.length > 0) {
      reportPaths("Generated, formatted, or ratchet files changed; review and commit intended paths:", changes);
      return 1;
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }

  if (failed) return 1;
  process.stdout.write("Static-analysis preflight passed.\n");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main();
