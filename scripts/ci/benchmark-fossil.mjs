#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FOSSIL = join(ROOT, "packages", "fossil");

function runJsonAnalysis(repositoryPath) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [join(FOSSIL, "dist", "bundle.js"), "analyze", repositoryPath, "--format", "json"],
      {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0 || stderr) return reject(new Error(`fossil exited ${code}: ${stderr}`));
      try {
        if (JSON.parse(stdout).schemaVersion !== 1) throw new Error("missing schema version 1");
        resolvePromise();
      } catch (error) {
        reject(error);
      }
    });
  });
}

export async function benchmarkFossilCli() {
  const { benchmarkPerformanceFixture, createPerformanceFixture, performanceBenchmarkJson } = await import(
    pathToFileURL(join(FOSSIL, "dist", "testing", "performance.js")).href
  );
  const fixture = await createPerformanceFixture();
  try {
    const result = await benchmarkPerformanceFixture(fixture, { runFreshJsonAnalysis: runJsonAnalysis });
    return performanceBenchmarkJson(result);
  } finally {
    await fixture.cleanup();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  benchmarkFossilCli().then((result) => process.stdout.write(`${result}\n`));
}
