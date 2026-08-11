import { promises as fs } from "node:fs";
import type { TaskNode } from "../types.js";
import { resolveGlob } from "./glob.js";
import { extractRequirementTitles } from "./requirements.js";
import type { OpenSpecInstructions } from "./types.js";

/** Converter output: the roots dod-guard's `writeMarkdown` renders, plus
 * the path the caller should write dod.md to. */
export interface ConvertedDod {
  resolvedOutputPath: string;
  roots: TaskNode[];
}

function requirementGroup(title: string, index: number): TaskNode {
  return {
    id: `req-${index}`,
    title,
    refinement: "draft",
    children: [],
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
 * every resolved spec delta file, in file-then-document order. No leaves
 * yet - a later step maps `#### Scenario:` blocks onto proof leaves.
 */
export async function convertInstructionsToDod(instructions: OpenSpecInstructions): Promise<ConvertedDod> {
  const files = await readDeltaFiles(instructions);
  const roots: TaskNode[] = [];
  let index = 0;

  for (const file of files) {
    const content = await fs.readFile(file, "utf-8");
    for (const title of extractRequirementTitles(content)) {
      roots.push(requirementGroup(title, index));
      index++;
    }
  }

  return { resolvedOutputPath: instructions.resolvedOutputPath, roots };
}
