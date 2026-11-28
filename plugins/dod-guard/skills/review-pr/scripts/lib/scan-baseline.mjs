// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { existsSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { dirname, join } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { pathToFileURL } from "node:url";
import { scanToFile } from "./scanner-run.mjs";

// Which scanner findings a pull request did not introduce. The answer comes
// from the installed quality-guard's own PR gate code, so a review and the CI
// gate agree about what is new: same changed-file list with renames, same
// finding identity, same matching by count, same moved-code rule. One
// deliberate difference: a finding that grew since the base is new here, while
// the gate lists it as pre-existing and does not block on it.

function gateModule(lib, name) {
  const path = join(lib, name);
  if (!existsSync(path)) {
    throw new Error(`quality-guard at ${lib} lacks ${name}; update quality-guard to a release that has the PR gate`);
  }
  return import(pathToFileURL(path).href);
}

async function gateModules(scanner) {
  const lib = join(dirname(scanner), "lib");
  const compare = await gateModule(lib, "pr-gate-compare.mjs");
  const scan = await gateModule(lib, "pr-gate-scan.mjs");
  const tree = await gateModule(lib, "merge-base-tree.mjs");
  return { classifyChanges: compare.classifyChanges, changedFiles: scan.changedFiles, exportTree: tree.exportTree };
}

// The gate blocks only on `fresh`. A finding it matched at the base is marked
// existing, unless it got worse: then the pull request made it worse, so this
// review counts it as new. A finding that moved from another changed file is
// marked existing too.
// classifyChanges returns each worsened finding as a copy with `was` added, so
// it is found again by the fields that place it.
const place = (finding) => JSON.stringify([finding.file, finding.line, finding.rule, finding.message]);

function markPreexisting(violations, classified) {
  const worse = new Set(classified.worsened.map(place));
  const kept = classified.existing.filter((finding) => !worse.has(place(finding)));
  const preexisting = new Set([...kept, ...classified.moved]);
  let marked = 0;
  for (const violation of violations) {
    if (preexisting.has(violation)) {
      violation.existing = true;
      marked += 1;
    }
  }
  return marked;
}

// The exported tree holds only tracked files, so no ignored path applies to
// it. Its report is written next to the tree, so the tree's cleanup removes it.
function baseViolations(scanner, dir) {
  return scanToFile(scanner, dir, join(dirname(dir), "base-scan.json"), []).violations ?? [];
}

// Marks, in place, each head violation the merge base `base` already had.
async function baselineMarks({ scanner, root, base, violations }) {
  const gate = await gateModules(scanner);
  const files = gate.changedFiles(base, root);
  const { dir, cleanup } = gate.exportTree(root, base);
  try {
    const classified = gate.classifyChanges({ files, head: violations, base: baseViolations(scanner, dir) });
    return { base, existing: markPreexisting(violations, classified), fresh: classified.fresh.length };
  } finally {
    cleanup();
  }
}

export { baselineMarks, gateModules, markPreexisting };
