// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { Buffer } from "node:buffer";
// biome-ignore lint/correctness/noNodejsModules: This skill helper starts the quality-guard scanner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import process from "node:process";
import { scanArguments } from "./ignored-paths.mjs";

// The scanner shares the descriptor, so its position is past the report; read
// from offset 0 instead.
function readDescriptor(fd) {
  const buffer = Buffer.alloc(fstatSync(fd).size);
  readSync(fd, buffer, 0, buffer.length, 0);
  return buffer.toString("utf8");
}

// The whole-repository report runs to megabytes, so the scanner writes straight
// to the descriptor instead of through a pipe.
function runScanner(scanner, root, fd, ignored) {
  const result = spawnSync(process.execPath, [scanner, ...scanArguments(root, ignored)], {
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

// Scans `root` into the file at `path` and returns the parsed report.
function scanToFile(scanner, root, path, ignored) {
  const fd = openSync(path, "w+");
  try {
    runScanner(scanner, root, fd, ignored);
    return JSON.parse(readDescriptor(fd));
  } finally {
    closeSync(fd);
  }
}

export { readDescriptor, runScanner, scanToFile };
