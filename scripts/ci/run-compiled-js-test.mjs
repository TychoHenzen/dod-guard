#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function isInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel.length > 0 && rel !== ".." && !rel.startsWith(`..${sep}`);
}

export function mapCompiledTest(root, testPath) {
  const source = resolve(root, testPath);
  if (!isInside(root, source)) throw new Error(`test path is outside the workspace: ${testPath}`);

  const parts = relative(root, source).split(sep);
  if (parts[0] === "tools") {
    if (!(source.endsWith(".test.js") || source.endsWith(".test.mjs"))) {
      throw new Error(`expected a tools/**/*.test.js or tools/**/*.test.mjs path: ${testPath}`);
    }
    return { packageName: undefined, compiledTest: source };
  }

  if (parts.length < 4 || parts[0] !== "packages") {
    throw new Error(`expected a test path inside packages/<name> or tools: ${testPath}`);
  }

  const packageName = parts[1];
  const packageRoot = resolve(root, "packages", packageName);
  if (!existsSync(resolve(packageRoot, "package.json"))) throw new Error(`package does not exist: ${packageName}`);

  if (parts[2] === "dist" && source.endsWith(".test.js")) return { packageName, compiledTest: source };
  if (parts[2] !== "src" || !source.endsWith(".test.ts")) {
    throw new Error(`expected a packages/<name>/src/**/*.test.ts or dist/**/*.test.js path: ${testPath}`);
  }

  const compiledParts = parts.slice(3);
  compiledParts[compiledParts.length - 1] = compiledParts.at(-1).replace(/\.ts$/, ".js");
  return { packageName, compiledTest: resolve(packageRoot, "dist", ...compiledParts) };
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: workspaceRoot, shell: false, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function findNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    resolve(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  return candidates.find((candidate) => typeof candidate === "string" && existsSync(candidate));
}

export function main(args) {
  if (args.length !== 1) {
    process.stderr.write(
      "usage: run-compiled-js-test.mjs <packages/<name>/(src/**/*.test.ts|dist/**/*.test.js)|tools/**/*.test.(js|mjs)>\n",
    );
    return 3;
  }

  let mapped;
  try {
    mapped = mapCompiledTest(workspaceRoot, args[0]);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 3;
  }

  if (mapped.packageName) {
    const npmCli = findNpmCli();
    if (!npmCli) {
      process.stderr.write("npm CLI could not be located next to the active Node.js runtime\n");
      return 3;
    }
    const buildStatus = run(process.execPath, [npmCli, "run", "build", "-w", `packages/${mapped.packageName}`]);
    if (buildStatus !== 0) return buildStatus;
  }
  if (!existsSync(mapped.compiledTest)) {
    process.stderr.write(`compiled test was not created: ${relative(workspaceRoot, mapped.compiledTest)}\n`);
    return 1;
  }
  return run(process.execPath, ["--experimental-test-module-mocks", "--test", mapped.compiledTest]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
