/**
 * The `covers:` marker. A scenario binds to a test by a comment directly
 * above the test declaration, read by regex - `cover` never executes a
 * test file to discover its markers. The comment prefix and test-declaration
 * pattern are determined by the file's extension via LANG_TABLE.
 *
 * Format: `<comment-prefix> covers: <group>/<capability> :: <requirement title> :: <scenario title>`
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { resolveGlob } from "../openspec/glob.js";
import { buildScenarioId } from "../openspec/scenario-id.js";
import { LANG_TABLE } from "./languages.js";
import { testGlobsForGroup } from "./package-dir.js";
import { loadTestGlobs } from "./test-globs.js";

export interface MarkerBinding {
  scenarioId: string;
  file: string;
  testName: string;
}

export function markersInFile(file: string, content: string): MarkerBinding[] {
  const ext = path.extname(file).toLowerCase();
  const lang = LANG_TABLE.get(ext);
  if (!lang) return [];

  const lines = content.split("\n");
  const bindings: MarkerBinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(lang.markerRe);
    if (!marker) continue;

    const [, groupCapability, requirementTitle, scenarioTitle] = marker;
    const slashIndex = groupCapability.indexOf("/");
    if (slashIndex === -1) continue;

    const testName = lang.findTestName(lines, i + 1);
    if (!testName) continue;

    bindings.push({
      scenarioId: buildScenarioId(
        groupCapability.slice(0, slashIndex),
        groupCapability.slice(slashIndex + 1),
        requirementTitle,
        scenarioTitle,
      ),
      file,
      testName,
    });
  }

  return bindings;
}

function resolvePatterns(group: string, testGlobs: Record<string, string[]>): string[] {
  if (group in testGlobs) return testGlobs[group];
  return testGlobsForGroup(group);
}

export async function scanMarkers(cwd: string, group: string): Promise<Map<string, MarkerBinding>> {
  const testGlobs = await loadTestGlobs(cwd);
  const bindings = new Map<string, MarkerBinding>();
  for (const pattern of resolvePatterns(group, testGlobs)) {
    for (const file of await resolveGlob(cwd, pattern)) {
      const content = await fs.readFile(file, "utf-8");
      for (const binding of markersInFile(file, content)) {
        bindings.set(binding.scenarioId, binding);
      }
    }
  }
  return bindings;
}
