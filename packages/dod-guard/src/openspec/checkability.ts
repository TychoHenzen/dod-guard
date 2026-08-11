import { findMissingTools } from "../command-check.js";
import type { ScenarioBlock } from "./scenario-block.js";

/** An inline code span with an internal space names a literal command or
 * output string precise enough to build a shell predicate around - e.g.
 * `` `npm test` ``. A bare single-word span (`` `THEN` ``, `` `MANUAL:` ``)
 * only names an identifier, not something runnable. */
const COMMAND_SPAN = /`([^`]*\s[^`]*)`/;

/** Executables a scenario's command span may start with to be promoted to a
 * concrete leaf. A space alone is not enough evidence a span is runnable -
 * the first real spec files this converter met held plenty of prose inside
 * backticks (e.g. `` `contains one step whose` ``). Requiring a known
 * executable as the first token is what tells those apart from `` `npm
 * test` ``. Seeded from what this repo's own specs and docs plausibly
 * invoke; extend as real specs need more. */
const ALLOWED_EXECUTABLES: ReadonlySet<string> = new Set([
  "npm",
  "npx",
  "node",
  "git",
  "openspec",
  "dod-guard",
  "grep",
  "findstr",
  "tsc",
  "biome",
]);

/** Pull the first command-shaped code span out of a scenario's intent,
 * stripped of its surrounding backticks. Empty string when none exists. */
export function extractCommand(scenario: ScenarioBlock): string {
  const match = scenario.intent.match(COMMAND_SPAN);
  return match ? match[1] : "";
}

function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0] ?? "";
}

/**
 * Layer 1, deterministic: a scenario is checkable when its intent names a
 * multi-word code span whose first token is a known executable
 * (`ALLOWED_EXECUTABLES`). This never touches the host PATH, so it holds
 * the same verdict on every machine.
 */
function isCheckable(scenario: ScenarioBlock): boolean {
  const command = extractCommand(scenario);
  if (!command) return false;
  return ALLOWED_EXECUTABLES.has(firstToken(command));
}

/**
 * Layer 2, final guard: a scenario is runnable only when it is checkable
 * (layer 1) AND its command passes the same OS tool-availability check the
 * importer already applies (`findMissingTools`). Nothing rejected at
 * import time should ever be promoted to a concrete leaf.
 */
export async function isRunnable(scenario: ScenarioBlock, cwd: string): Promise<boolean> {
  if (!isCheckable(scenario)) return false;
  const missing = await findMissingTools([extractCommand(scenario)], cwd);
  return missing.length === 0;
}
