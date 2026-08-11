import { promises as fs } from "node:fs";
import type { TaskNode } from "../types.js";
import { extractCommand, isCheckable } from "./checkability.js";
import { resolveGlob } from "./glob.js";
import { extractRequirementBlocks } from "./requirements.js";
import type { ScenarioBlock } from "./scenario-block.js";
import type { OpenSpecInstructions } from "./types.js";

/** Converter output: the roots dod-guard's `writeMarkdown` renders, plus
 * the path the caller should write dod.md to. */
export interface ConvertedDod {
  resolvedOutputPath: string;
  roots: TaskNode[];
}

/** A scenario naming a runnable command (see checkability.ts) becomes a
 * concrete leaf that command can prove. Everything else needs human
 * judgment, so it becomes a draft leaf holding a `MANUAL:` intent - the
 * only "a human still owes us something" leaf shape dod-guard has. */
function scenarioLeaf(scenario: ScenarioBlock, id: string): TaskNode {
  if (isCheckable(scenario)) {
    return {
      id,
      title: scenario.title,
      refinement: "concrete",
      command: extractCommand(scenario),
      predicate: { type: "exit_code", value: 0 },
      description: scenario.intent,
      category: "other",
      last_status: "pending",
    };
  }
  return {
    id,
    title: scenario.title,
    refinement: "draft",
    intent: `MANUAL: ${scenario.intent}`,
    last_status: "draft",
  };
}

function requirementGroup(title: string, index: number, scenarios: ScenarioBlock[]): TaskNode {
  return {
    id: `req-${index}`,
    title,
    refinement: "draft",
    children: scenarios.map((scenario, si) => scenarioLeaf(scenario, `req-${index}-scenario-${si}`)),
    last_status: "draft",
  };
}

async function readDeltaFiles(instructions: OpenSpecInstructions): Promise<string[]> {
  const files: string[] = [];
  for (const dep of instructions.dependencies) {
    files.push(...(await resolveGlob(instructions.changeDir, dep.path)));
  }
  return files;
}

/**
 * Turn parsed `instructions --json` output into a DodDocument-shaped
 * roots tree: one group node per `### Requirement:` heading found across
 * every resolved spec delta file, in file-then-document order, each
 * holding one draft leaf per `#### Scenario:` found under it. A leaf's
 * intent is its scenario's `THEN` text.
 */
export async function convertInstructionsToDod(instructions: OpenSpecInstructions): Promise<ConvertedDod> {
  const files = await readDeltaFiles(instructions);
  const roots: TaskNode[] = [];
  let index = 0;

  for (const file of files) {
    const content = await fs.readFile(file, "utf-8");
    for (const block of extractRequirementBlocks(content)) {
      roots.push(requirementGroup(block.title, index, block.scenarios));
      index++;
    }
  }

  return { resolvedOutputPath: instructions.resolvedOutputPath, roots };
}
