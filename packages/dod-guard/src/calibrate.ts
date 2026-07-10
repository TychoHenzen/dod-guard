// Calibration script: run test-metrics on all test files and print scores
// Usage: node --experimental-test-module-mocks dist/calibrate.js

import { existsSync } from "node:fs";
import * as path from "node:path";

// Quick glob of all test files manually
const TEST_FILES = [
  "src/assertions.test.ts",
  "src/author.test.ts",
  "src/baseline.test.ts",
  "src/brevity.test.ts",
  "src/checker.test.ts",
  "src/command-check.test.ts",
  "src/manual.test.ts",
  "src/notify.test.ts",
  "src/observability.test.ts",
  "src/parser.test.ts",
  "src/regression.test.ts",
  "src/store.test.ts",
];

import { analyseTestMetrics, scoreFromMetrics } from "./test-metrics.js";

const cwd = process.cwd();
// Use a command that references all test files
const cmd = `node ${TEST_FILES.join(" ")}`;

const report = analyseTestMetrics(cmd, cwd);
if (!report) {
  console.log("NO REPORT");
  process.exit(1);
}

console.log("=== CALIBRATION RESULTS ===\n");

const scores: Record<string, number>[] = [];
const dims = ["assertion_quality", "determinism", "isolation", "clarity", "coverage_depth", "speed", "diagnostics", "assertion_triviality", "overall"];

for (const m of report.perFile) {
  const s = scoreFromMetrics(m);
  scores.push(s);
  console.log(`### ${m.file}`);
  console.log(`  Functions: ${m.testFunctionCount}  Assertions: ${m.totalAssertions} (trivial: ${m.trivialAssertions}, truthiness: ${m.truthinessAssertions}, specific: ${m.specificAssertions})`);
  console.log(`  DetV: time=${m.hasRealTime} rand=${m.hasUnseededRandom} sleep=${m.hasSleep} fs=${m.hasRealFilesystem} net=${m.hasRealNetwork} db=${m.hasRealDatabase} mut=${m.hasSharedMutableState}`);
  console.log(`  Iso: setup=${m.hasSetupTeardown} mutable=${m.moduleMutableCount} only=${m.hasTestOnly}`);
  console.log(`  Clarity: generic=${m.genericNames.length} aaa=${m.hasAaaMarkers} magic=${m.magicNumberCount}`);
  console.log(`  Speed: sleep=${m.sleepWaitCount} io=${m.realIoCount}`);
  console.log(`  Depth: errorFns=${m.errorPathFunctions}`);
  console.log(`  Diag: msged=${m.assertionsWithMessage} unmsged=${m.assertionsWithoutMessage} diff=${m.frameworkShowsDiff}`);
  console.log("  SCORES:", dims.map(d => `${d}=${(s as any)[d]}`).join(" "));
  console.log();
}

// Distribution stats
console.log("=== DISTRIBUTION ===\n");
for (const d of dims) {
  const vals = scores.map(s => (s as any)[d]);
  vals.sort((a, b) => a - b);
  const n = vals.length;
  const median = n % 2 === 0 ? (vals[n/2 - 1] + vals[n/2]) / 2 : vals[Math.floor(n/2)];
  const min = vals[0];
  const max = vals[n - 1];
  const mean = (vals.reduce((a, b) => a + b, 0) / n).toFixed(1);
  const below3 = vals.filter(v => v < 3).length;
  const above8 = vals.filter(v => v > 8).length;
  console.log(`${d.padEnd(22)} median=${median.toFixed(1)} mean=${mean} min=${min} max=${max} <3:${below3} >8:${above8}`);
}
