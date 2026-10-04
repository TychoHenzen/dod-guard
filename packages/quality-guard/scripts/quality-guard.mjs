#!/usr/bin/env node
/** PostToolUse file-local quality gate. Internal failures fail open. */
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { hookTargets } from "./hook-targets.mjs";
import { gate } from "./quality-guard-gate.mjs";
import { createLocalResult } from "./quality-guard-local.mjs";
import { createHookOutput } from "./quality-guard-gate-support.mjs";

const CODE_EXT = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".cs",
  ".rs",
  ".py",
  ".go",
  ".java",
  ".kt",
  ".cpp",
  ".cc",
  ".hpp",
  ".h",
]);

function isGateTarget({ filePath }) {
  if (!CODE_EXT.has(extname(filePath).toLowerCase())) return false;
  if (!existsSync(filePath)) return false;
  return !/quality-guard:\s*off/i.test(
    readFileSync(filePath, "utf8").slice(0, 500),
  );
}

function activeTargets(input) {
  return hookTargets(input).filter(isGateTarget);
}

function shouldGate(input) {
  if (!input || process.env.QUALITY_GUARD === "off") return false;
  return activeTargets(input).length > 0;
}

async function runTarget({ target, services, report, unavailableReport }) {
  try {
    return await gate(target.input, target.filePath, {
      ...services,
      localResult: services.localResult,
      report,
      unavailable: unavailableReport,
    });
  } catch (error) {
    return unavailableReport(
      target.filePath,
      `hook failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function runTargets(input) {
  const output = createHookOutput();
  const localResult = createLocalResult(output.report);
  const services = { localResult };
  let code = 0;
  for (const target of activeTargets(input)) {
    code = await runTarget({
      target,
      services,
      report: output.report,
      unavailableReport: output.unavailable,
    });
    if (code !== 0) break;
  }
  output.flush();
  return code === 0 ? 0 : code;
}

async function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return 0;
  }
  if (!shouldGate(input)) return 0;
  return runTargets(input);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch(() => process.exit(0));
}
