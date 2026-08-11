import type { TaskNode } from "../types.js";

/** One entry in a step-by-step steps.json `steps` array. Shape mirrors the
 * Persistence section of skills/step-by-step/SKILL.md and the `steps`
 * artifact template at
 * openspec/schemas/dod-guard-spec-driven/templates/steps.json. */
export interface Step {
  id: string;
  title: string;
  description: string;
  files: string[];
  deps: string[];
  verify_surface: string;
  verify_cmd: string;
  manual_required: boolean;
  status: "pending";
}

/** Build one step from a concrete leaf. `command` copies verbatim into
 * `verify_cmd` - no `dod-guard check` wrapping. `previousId` chains steps
 * into a linear order, so a group's first leaf still depends on the last
 * leaf of the group before it. */
function leafToStep(leaf: TaskNode, previousId: string | undefined): Step {
  return {
    id: leaf.id,
    title: leaf.title,
    description: leaf.description ?? "",
    files: [],
    deps: previousId ? [previousId] : [],
    verify_surface: "code",
    verify_cmd: leaf.command ?? "",
    manual_required: false,
    status: "pending",
  };
}

/**
 * Turn a DoD node tree - one requirement group per root, each holding
 * scenario leaves in source order (the shape `convertInstructionsToDod`
 * produces) - into the `steps` array of a step-by-step steps.json. Draft
 * leaves are skipped here; mapping them to `manual_required` steps is a
 * later step. Leaves keep source order within their group, and every step
 * depends on the one immediately before it in that flattened order.
 */
export function dodTreeToSteps(roots: TaskNode[]): Step[] {
  const steps: Step[] = [];
  for (const group of roots) {
    for (const leaf of group.children ?? []) {
      if (leaf.refinement !== "concrete") {
        continue;
      }
      steps.push(leafToStep(leaf, steps.at(-1)?.id));
    }
  }
  return steps;
}
