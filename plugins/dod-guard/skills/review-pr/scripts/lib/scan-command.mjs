// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { closeSync, existsSync, ftruncateSync, openSync, writeSync } from "node:fs";
import { readJsonFile } from "../../../../lib/read-text.mjs";
import { ignoredPaths } from "./ignored-paths.mjs";
import { applyRepoLimits, repoLimits } from "./repo-limits.mjs";
import { baselineMarks } from "./scan-baseline.mjs";
import { scannerPath } from "./scanner-location.mjs";
import { readDescriptor, runScanner } from "./scanner-run.mjs";

// The repository's own limits replace the scanner's defaults before any later
// command numbers the violations. One descriptor carries the raw report and
// its rewrite, so nothing can swap the file between the read and the write.
function limitReport(fd, root, raw) {
  const limits = repoLimits(root);
  const limited = applyRepoLimits(raw, limits);
  const report = { ...limited.scan, repoLimits: { floors: limits.floors, removed: limited.removed } };
  ftruncateSync(fd, 0);
  writeSync(fd, JSON.stringify(report), 0);
  return {
    violations: limited.scan.violations.length,
    ruleFloors: limits.floors,
    removedByRepoLimits: limited.removed,
    baseline: raw.baseline,
  };
}

function existingScanner(args) {
  const scanner = scannerPath(args.client, readJsonFile(args.registry));
  if (!existsSync(scanner)) {
    throw new Error(`quality-guard scanner not found at ${scanner}`);
  }
  return scanner;
}

// The marks go on the raw report, which is what the CI gate compares, before
// the repository's limits drop anything.
// The repository's limits are read from --root, so the gate's own flags are
// never passed here.
async function scan(args) {
  const scanner = existingScanner(args);
  const out = openSync(args.out, "w+");
  try {
    runScanner(scanner, args.root, out, ignoredPaths(args.root));
    const raw = JSON.parse(readDescriptor(out));
    const violations = raw.violations ?? [];
    const baseline = await baselineMarks({ scanner, root: args.root, base: args.base, violations });
    return { scanner, out: args.out, ...limitReport(out, args.root, { ...raw, baseline }) };
  } finally {
    closeSync(out);
  }
}

export { scan };
