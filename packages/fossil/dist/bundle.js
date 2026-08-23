#!/usr/bin/env node

// src/index.ts
import { readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
var _filename = fileURLToPath(import.meta.url);
var _dirname = path.dirname(_filename);
function isMainModule() {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return realpathSync(arg) === realpathSync(_filename);
  } catch {
    return arg === _filename;
  }
}
function readVersion() {
  const pkgPath = path.join(_dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return pkg.version;
}
async function main() {
  process.stdout.write(`fossil ${readVersion()}
`);
}
if (isMainModule()) {
  main().catch((err) => {
    process.stderr.write(`fossil CLI failed: ${err}
`);
    process.exit(1);
  });
}
