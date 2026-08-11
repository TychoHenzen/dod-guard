/**
 * Scenario identity, kept outside the DodDocument entirely.
 *
 * `author.ts` never renders a leaf's scenario heading (see `renderLeaf`),
 * and `parser.ts` reconstructs `title` from the rendered description/intent
 * text instead (see `parseLeafLine`). So the only path into canonical
 * storage - `dod_import`, which every OpenSpec-generated DoD goes through
 * once - already throws the scenario heading away by the time
 * `regenerateDod` would need it to key a diff.
 *
 * This sidecar, written and read only by `src/openspec/` code, remembers
 * which stored node id each (requirement heading, scenario heading) pair
 * landed on. It plays no part in `computeProofFingerprint` or the tamper
 * check in `checker.ts` - losing it, or it going stale, only degrades
 * `regenerateDod`'s ability to tell "edited" from "added+removed". It can
 * never let a hand-edit bypass the fingerprint, because every mutation
 * still goes through `dod_amend`/`dod_add_node`/`dod_remove_node`, which
 * recompute the fingerprint themselves.
 */
import { promises as fs } from "node:fs";
import type { TaskNode } from "../types.js";

export interface ScenarioMapEntry {
  groupTitle: string;
  scenarioTitle: string;
  nodeId: string;
}

function sidecarPath(resolvedOutputPath: string): string {
  return `${resolvedOutputPath}.scenario-map.json`;
}

export function scenarioKey(groupTitle: string, scenarioTitle: string): string {
  return `${groupTitle}||${scenarioTitle}`;
}

export async function readScenarioMap(resolvedOutputPath: string): Promise<ScenarioMapEntry[]> {
  try {
    const raw = await fs.readFile(sidecarPath(resolvedOutputPath), "utf-8");
    return JSON.parse(raw) as ScenarioMapEntry[];
  } catch {
    return [];
  }
}

export async function writeScenarioMap(resolvedOutputPath: string, entries: ScenarioMapEntry[]): Promise<void> {
  await fs.writeFile(sidecarPath(resolvedOutputPath), JSON.stringify(entries, null, 2), "utf-8");
}

/** Right after a fresh import, zip the pre-roundtrip converted tree (real
 * scenario titles) against the just-imported doc's roots. Both walk the
 * same requirement/scenario order the converter produced, so position
 * lines them up even though the imported copy's own `title` field is
 * already lossy. */
export function buildScenarioMap(convertedRoots: TaskNode[], importedRoots: TaskNode[]): ScenarioMapEntry[] {
  const entries: ScenarioMapEntry[] = [];
  convertedRoots.forEach((group, gi) => {
    const importedGroup = importedRoots[gi];
    for (const [li, leaf] of (group.children ?? []).entries()) {
      const importedLeaf = importedGroup?.children?.[li];
      if (importedLeaf) {
        entries.push({ groupTitle: group.title, scenarioTitle: leaf.title, nodeId: importedLeaf.id });
      }
    }
  });
  return entries;
}
