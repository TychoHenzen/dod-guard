#!/usr/bin/env node
// smoke-cli-bundle — start a CLI bundle without imposing the MCP protocol.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function runCli(bundle, args = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [bundle, ...args], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

export async function smokeCliBundle(bundle, version) {
  const result = await runCli(bundle);
  const expected = `fossil ${version}\n`;
  if (result.code !== 0)
    throw new Error(`CLI exited with code ${result.code}: ${result.stderr.trim() || "(empty stderr)"}`);
  if (result.stderr) throw new Error(`CLI wrote to stderr: ${result.stderr.trim()}`);
  if (result.stdout !== expected)
    throw new Error(`CLI startup output was ${JSON.stringify(result.stdout)}, expected ${JSON.stringify(expected)}`);
  return result;
}

async function main(argv) {
  const pkgDir = argv[0];
  if (!pkgDir || argv.length !== 1) {
    process.stderr.write("usage: smoke-cli-bundle.mjs <package-directory>\n");
    return 3;
  }
  const packageDir = join(ROOT, "packages", pkgDir);
  const bundle = join(packageDir, "dist", "bundle.js");
  if (!existsSync(bundle)) {
    process.stderr.write(`bundle not built: ${bundle}\n`);
    return 3;
  }
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  try {
    await smokeCliBundle(bundle, manifest.version);
    process.stdout.write(`CLI smoke OK - ${manifest.name} v${manifest.version}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`CLI smoke FAILED for ${manifest.name}\n  ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
