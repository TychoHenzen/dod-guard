/**
 * Scenario enumeration for `dod-guard cover`. Two modes, one shape: a
 * change-scoped run reads `openspec/changes/<id>/specs/**\/spec.md` (what a
 * developer and `verify_cmd` care about); `--all` reads
 * `openspec/specs/**\/spec.md` (the main tree, what CI's ratchet has to see
 * so a regression in an already-archived capability isn't invisible).
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { resolveGlob } from "../openspec/glob.js";
import { extractRequirementBlocks } from "../openspec/requirements.js";
import { buildScenarioId } from "../openspec/scenario-id.js";

export interface EnumeratedScenario {
  id: string;
  group: string;
  capability: string;
  requirementTitle: string;
  scenarioTitle: string;
  intent: string;
  specPath: string;
}

/** `<group>/<capability>` from a spec file's path relative to the directory
 * that directly holds every group's subtree (either `openspec/specs` or
 * `openspec/changes/<id>/specs`). */
function capabilityFromPath(specsDir: string, specFile: string): { group: string; capability: string } | null {
  const rel = path.relative(specsDir, specFile).split(path.sep);
  if (rel.length < 3) return null; // expects <group>/<capability>/spec.md
  return { group: rel[0], capability: rel[1] };
}

async function scenariosFromFile(specsDir: string, specFile: string): Promise<EnumeratedScenario[]> {
  const located = capabilityFromPath(specsDir, specFile);
  if (!located) return [];
  const content = await fs.readFile(specFile, "utf-8");
  const scenarios: EnumeratedScenario[] = [];
  for (const block of extractRequirementBlocks(content)) {
    for (const scenario of block.scenarios) {
      scenarios.push({
        id: buildScenarioId(located.group, located.capability, block.title, scenario.title),
        group: located.group,
        capability: located.capability,
        requirementTitle: block.title,
        scenarioTitle: scenario.title,
        intent: scenario.intent,
        specPath: specFile,
      });
    }
  }
  return scenarios;
}

async function enumerateUnder(specsDir: string): Promise<EnumeratedScenario[]> {
  const files = await resolveGlob(specsDir, "**/spec.md");
  const out: EnumeratedScenario[] = [];
  for (const file of files) out.push(...(await scenariosFromFile(specsDir, file)));
  return out;
}

/** Every scenario a change's own spec deltas currently declare. */
export async function enumerateChangeScenarios(cwd: string, changeId: string): Promise<EnumeratedScenario[]> {
  return enumerateUnder(path.join(cwd, "openspec", "changes", changeId, "specs"));
}

/** Every scenario the main spec tree currently declares. */
export async function enumerateAllScenarios(cwd: string): Promise<EnumeratedScenario[]> {
  return enumerateUnder(path.join(cwd, "openspec", "specs"));
}
