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

/** `convert.ts`'s `scenarioLeaf` writes this exact prefix (colon, one
 * space) onto every draft leaf it produces for a human-judgment scenario. */
const MANUAL_PREFIX = "MANUAL: ";

/** Build one step from a `MANUAL:` draft leaf. No command exists to check,
 * so `verify_cmd` is empty and `manual_required` stands in for the missing
 * proof. The description is the intent with the prefix stripped - both
 * already mean "a human still owes us something". */
function manualLeafToStep(leaf: TaskNode, previousId: string | undefined): Step {
  return {
    id: leaf.id,
    title: leaf.title,
    description: (leaf.intent ?? "").slice(MANUAL_PREFIX.length),
    files: [],
    deps: previousId ? [previousId] : [],
    verify_surface: "code",
    verify_cmd: "",
    manual_required: true,
    status: "pending",
  };
}

/**
 * Turn a DoD node tree - one requirement group per root, each holding
 * scenario leaves in source order (the shape `convertInstructionsToDod`
 * produces) - into the `steps` array of a step-by-step steps.json. A
 * concrete leaf becomes a normal step; a draft leaf whose intent starts
 * with `MANUAL:` becomes a manual step. A draft leaf whose intent does
 * NOT start with `MANUAL:` is skipped: dod-guard's own draft leaves never
 * carry an intent in any other shape, so there is nothing to convert, and
 * a group node (a draft with `children`) is never itself iterated as a
 * leaf here. Leaves keep source order within their group, and every step
 * depends on the one immediately before it in that flattened order.
 */
export function dodTreeToSteps(roots: TaskNode[]): Step[] {
  const steps: Step[] = [];
  for (const group of roots) {
    for (const leaf of group.children ?? []) {
      const previousId = steps.at(-1)?.id;
      if (leaf.refinement === "concrete") {
        steps.push(leafToStep(leaf, previousId));
        continue;
      }
      if (leaf.intent?.startsWith(MANUAL_PREFIX)) {
        steps.push(manualLeafToStep(leaf, previousId));
      }
    }
  }
  return steps;
}
