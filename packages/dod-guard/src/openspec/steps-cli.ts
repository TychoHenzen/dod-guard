/**
 * The body of `dod-guard steps <change-id>`: turn the DoD registered for a
 * change into that change's `steps.json` plan.
 *
 * Every path here comes from the openspec CLI. The DoD is found the same way
 * `dod-guard trace` finds it (`loadTraceTree`), and the plan is written where
 * the `steps` artifact says it belongs, never at a path built from string
 * parts - a schema that renames or moves the artifact has to keep working.
 */
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { fetchInstructions, fetchStatus } from "./fetch-instructions.js";
import { dodTreeToSteps, type Step } from "./steps.js";
import { loadTraceTree } from "./trace.js";

/** A step-by-step plan file. Key order is the file's field order, which the
 * `steps` artifact template fixes: the header a reader needs first, then the
 * work. `plan_artifacts` is copied from `openspec status` untouched. */
export interface StepsPlan {
  goal: string;
  cwd: string;
  plan_source: string;
  plan_artifacts: unknown[];
  steps: Step[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build and write `changeId`'s plan. Returns null when the change has no
 * registered DoD, in canonical storage or on disk - the caller maps that to
 * an exit code. Any openspec CLI failure throws instead, so a broken change
 * id is never mistaken for a missing DoD. `overwrote` is true when a plan
 * already sat at that path, which the caller warns about: the rewrite drops
 * whatever a human had filled into `files` and `verify_surface`.
 */
export async function writeStepsPlan(
  changeId: string,
  cwd: string,
): Promise<{ plan: StepsPlan; outputPath: string; overwrote: boolean } | null> {
  const dod = await fetchInstructions(changeId, cwd, "dod");
  const doc = await loadTraceTree(dod.resolvedOutputPath);
  if (!doc) return null;

  const target = await fetchInstructions(changeId, cwd, "steps");
  const status = await fetchStatus(changeId, cwd);

  const plan: StepsPlan = {
    goal: doc.goal,
    cwd: target.root.path,
    plan_source: changeId,
    plan_artifacts: status.artifacts ?? [],
    steps: dodTreeToSteps(doc.roots),
  };

  const outputPath = target.resolvedOutputPath;
  const overwrote = await exists(outputPath);
  await fs.mkdir(dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf-8");

  return { plan, outputPath, overwrote };
}
