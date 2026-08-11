import { promises as fs } from "node:fs";
import type { TaskNode } from "../types.js";
import { extractCommand, isRunnable } from "./checkability.js";
import { resolveGlob } from "./glob.js";
import type { RequirementBlock } from "./requirement-block.js";
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
async function scenarioLeaf(scenario: ScenarioBlock, id: string, cwd: string): Promise<TaskNode> {
  if (await isRunnable(scenario, cwd)) {
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

async function requirementGroup(block: RequirementBlock, index: number, cwd: string): Promise<TaskNode> {
  const children = await Promise.all(
    block.scenarios.map((scenario, si) => scenarioLeaf(scenario, `req-${index}-scenario-${si}`, cwd)),
  );
  return {
    id: `req-${index}`,
    title: block.title,
    refinement: "draft",
    children,
    last_status: "draft",
  };
}

/** Every spec delta file `instructions.dependencies` resolves to, in
 * dependency-then-glob-match order. Shared with `trace.ts`, which needs
 * the same file set to re-derive the current scenario list. */
export async function readDeltaFiles(instructions: OpenSpecInstructions): Promise<string[]> {
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
  const cwd = instructions.root.path;
  const roots: TaskNode[] = [];
  let index = 0;

  for (const file of files) {
    const content = await fs.readFile(file, "utf-8");
    for (const block of extractRequirementBlocks(content)) {
      roots.push(await requirementGroup(block, index, cwd));
      index++;
    }
  }

  return { resolvedOutputPath: instructions.resolvedOutputPath, roots };
}
