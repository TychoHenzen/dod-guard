#!/usr/bin/env node
// smoke-cli-bundle — verify the CLI-only fossil workspace without the MCP protocol.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Packages that undergo the separate MCP stdio handshake smoke. Fossil must remain absent. */
export const MCP_HANDSHAKE_PACKAGE_DIRECTORIES = ["dod-guard", "quality-guard"];

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

function requiredEntrypoint(manifest, field) {
  const entrypoint = field === "main" ? manifest.main : manifest.bin?.fossil;
  if (typeof entrypoint !== "string") throw new Error(`package.json is missing ${field} entrypoint`);
  return entrypoint;
}

function assertCliOnlyPackage(packageDirectory) {
  const packageDirectoryName = packageDirectory.split(/[\\/]/).at(-1);
  if (MCP_HANDSHAKE_PACKAGE_DIRECTORIES.includes(packageDirectoryName))
    throw new Error(`${packageDirectoryName} is reserved for the MCP handshake smoke`);
}

/** Validates fossil package entrypoints and its non-MCP command-line help contract. */
export async function smokeCliBundle(packageDirectory) {
  assertCliOnlyPackage(packageDirectory);
  const manifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
  const mainEntrypoint = requiredEntrypoint(manifest, "main");
  const bundleEntrypoint = requiredEntrypoint(manifest, "bin.fossil");
  const main = join(packageDirectory, mainEntrypoint);
  const bundle = join(packageDirectory, bundleEntrypoint);
  if (!existsSync(main)) throw new Error(`main entrypoint not built: ${main}`);
  if (!existsSync(bundle)) throw new Error(`CLI bundle not built: ${bundle}`);
  if (!readFileSync(bundle, "utf8").startsWith("#!/usr/bin/env node"))
    throw new Error(`CLI bundle is not executable: ${bundle}`);

  const result = await runCli(bundle, ["--help"]);
  if (result.code !== 0)
    throw new Error(`CLI help exited with code ${result.code}: ${result.stderr.trim() || "(empty stderr)"}`);
  if (result.stderr) throw new Error(`CLI help wrote to stderr: ${result.stderr.trim()}`);
  if (!/Usage: fossil\b/.test(result.stdout)) throw new Error("CLI help did not include fossil usage");
  return { manifest, result };
}

async function main(argv) {
  const packageDirectoryName = argv[0];
  if (!packageDirectoryName || argv.length !== 1) {
    process.stderr.write("usage: smoke-cli-bundle.mjs <package-directory>\n");
    return 3;
  }
  const packageDirectory = join(ROOT, "packages", packageDirectoryName);
  try {
    const { manifest } = await smokeCliBundle(packageDirectory);
    process.stdout.write(`CLI integrity OK - ${manifest.name} v${manifest.version}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`CLI integrity FAILED for ${packageDirectoryName}\n  ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
