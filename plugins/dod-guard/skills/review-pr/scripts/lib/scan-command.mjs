// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { Buffer } from "node:buffer";
// biome-ignore lint/correctness/noNodejsModules: This skill helper starts the quality-guard scanner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { closeSync, existsSync, fstatSync, ftruncateSync, openSync, readSync, writeSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import process from "node:process";
import { readJsonFile } from "../../../../lib/read-text.mjs";
import { ignoredPaths, scanArguments } from "./ignored-paths.mjs";
import { applyRepoLimits, repoLimits } from "./repo-limits.mjs";
import { scannerPath } from "./scanner-location.mjs";

// The scanner shares the descriptor, so its position is past the report; read
// from offset 0 instead.
function readDescriptor(fd) {
  const buffer = Buffer.alloc(fstatSync(fd).size);
  readSync(fd, buffer, 0, buffer.length, 0);
  return buffer.toString("utf8");
}

// The repository's own limits replace the scanner's defaults before any later
// command numbers the violations. One descriptor carries the raw report and
// its rewrite, so nothing can swap the file between the read and the write.
function limitReport(fd, root) {
  const limits = repoLimits(root);
  const limited = applyRepoLimits(JSON.parse(readDescriptor(fd)), limits);
  const report = { ...limited.scan, repoLimits: { floors: limits.floors, removed: limited.removed } };
  ftruncateSync(fd, 0);
  writeSync(fd, JSON.stringify(report), 0);
  return {
    violations: limited.scan.violations.length,
    ruleFloors: limits.floors,
    removedByRepoLimits: limited.removed,
  };
}

// The whole-repository report runs to megabytes, so the scanner writes straight
// to the descriptor instead of through a pipe.
function runScanner(scanner, root, fd) {
  const result = spawnSync(process.execPath, [scanner, ...scanArguments(root, ignoredPaths(root))], {
    cwd: root,
    stdio: ["ignore", fd, "pipe"],
    shell: false,
  });
  if (result.error) {
    throw new Error(`quality-scan failed (${result.status}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`quality-scan failed (${result.status}): ${result.stderr}`);
  }
}

function existingScanner(args) {
  const scanner = scannerPath(args.client, readJsonFile(args.registry));
  if (!existsSync(scanner)) {
    throw new Error(`quality-guard scanner not found at ${scanner}`);
  }
  return scanner;
}

// The repository's limits are read from --root, so the gate's own flags are
// never passed here.
function scan(args) {
  const scanner = existingScanner(args);
  const out = openSync(args.out, "w+");
  try {
    runScanner(scanner, args.root, out);
    return { scanner, out: args.out, ...limitReport(out, args.root) };
  } finally {
    closeSync(out);
  }
}

export { scan };
