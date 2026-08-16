// markers.mjs - batch coverage scanner for the dashboard.
//
// The original scanMarkers walks glob patterns and reads files once per
// group. When the overview needs 6 groups that share the same default
// globs, that means 6 full directory walks reading the same files.
//
// scanAllMarkers walks the union of all configured patterns once, reads
// each file once, and returns every binding in a flat map. The caller
// bins by group from the scenarioId prefix.

import { markersInFile } from "../../../packages/dod-guard/dist/cover/markers.js";
import { resolveGlob } from "../../../packages/dod-guard/dist/openspec/glob.js";
import { loadTestGlobs } from "../../../packages/dod-guard/dist/cover/test-globs.js";
import { testGlobsForGroup } from "../../../packages/dod-guard/dist/cover/package-dir.js";
import { readFile } from "node:fs/promises";

export { scanMarkers } from "../../../packages/dod-guard/dist/cover/markers.js";

export async function scanAllMarkers(cwd) {
  const testGlobs = await loadTestGlobs(cwd);
  const defaultPatterns = testGlobsForGroup("");
  const allPatterns = new Set(defaultPatterns);
  for (const patterns of Object.values(testGlobs)) {
    for (const p of patterns) allPatterns.add(p);
  }

  const fileSet = new Set();
  for (const pattern of allPatterns) {
    for (const file of await resolveGlob(cwd, pattern)) fileSet.add(file);
  }

  const bindings = new Map();
  for (const file of fileSet) {
    const content = await readFile(file, "utf-8");
    for (const binding of markersInFile(file, content)) {
      bindings.set(binding.scenarioId, binding);
    }
  }
  return bindings;
}
