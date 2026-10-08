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
  return { status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function runNpm(name, args, options = {}) {
  const command = npmCommand(args);
  return run(command.command, command.args, { name, shell: command.shell, ...options });
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

function runQualityDiagnostics() {
  const env = { ...process.env, QUALITY_RULES, QUALITY_SCAN };
  const qualityArgs = [...QUALITY_PATH_ARGS, `--rules=${QUALITY_RULES}`];
  runNode("Quality diagnostics (advisory)", QUALITY_SCAN, qualityArgs, {
    allowFailure: true,
    env,
  });
}

function runBiomeCheck() {
  const primary = runNpm(
    "Biome strict check",
    ["exec", "--", "biome", "check", "--max-diagnostics=200", "--no-errors-on-unmatched"],
    {
      allowFailure: true,
    },
  );
  const output = `${primary.stdout}${primary.stderr}`;
  if (!/Diagnostics not shown:\s*[1-9]\d*/.test(output)) {
    if (primary.status !== 0) throw new Error(`Biome strict check exited with status ${primary.status}`);
    return;
  }

  let fallback;
  let fallbackError;
  try {
    fallback = runNpm(
      "Biome error diagnostics",
      [
        "exec",
        "--",
        "biome",
        "check",
        "--diagnostic-level=error",
        "--max-diagnostics=none",
        "--no-errors-on-unmatched",
      ],
      { allowFailure: true },
    );
  } catch (error) {
    fallbackError = error;
  }

  const failures = [];
  if (primary.status !== 0) failures.push(`Biome strict check exited with status ${primary.status}`);
  if (fallbackError) failures.push(fallbackError.message);
  else if (fallback.status !== 0) failures.push(`Biome error diagnostics exited with status ${fallback.status}`);
  if (failures.length > 0) throw new Error(failures.join("; "));
}

function runDiagnostics() {
  runQualityDiagnostics();
  runNode("Test presence diagnostics", "scripts/ci/check-tests-present.mjs", [], {
    allowFailure: true,
  });
  runNode("Dependency advisory diagnostics", "scripts/ci/check-audit.mjs", [], {
    allowFailure: true,
  });
  runNode("Coverage diagnostics", "scripts/ci/check-coverage.mjs", [], {
    allowFailure: true,
  });
  runBiomeCheck();
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
    runNpm("Build test workspaces", ["run", "build:test", "--workspaces"]);
    runNpm("Prepare test workspaces", ["run", "prepare:test", "--workspaces", "--if-present"]);
    runNpm("Reproduce Biome formatting", ["exec", "--", "biome", "format", "--write", "--no-errors-on-unmatched"]);
    run(process.execPath, ["--test", "scripts/ci/preflight-static-analysis.test.mjs"], {
      name: "Static-analysis preflight tests",
    });
    runDiagnostics();
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
