import type { ScenarioBlock } from "./scenario-block.js";

/** An inline code span with an internal space names a literal command or
 * output string precise enough to build a shell predicate around - e.g.
 * `` `npm test` ``. A bare single-word span (`` `THEN` ``, `` `MANUAL:` ``)
 * only names an identifier, not something runnable. */
const COMMAND_SPAN = /`([^`]*\s[^`]*)`/;

/**
 * A scenario is checkable when its THEN text names something a shell
 * command can verify: at least one inline code span with an internal
 * space. Plain prose, or a span with no space, names nothing runnable, so
 * the scenario needs human judgment instead and stays a draft.
 */
export function isCheckable(scenario: ScenarioBlock): boolean {
  return COMMAND_SPAN.test(scenario.intent);
}

/** Pull the first command-shaped code span out of a checkable scenario's
 * intent, stripped of its surrounding backticks. Empty string when the
 * scenario is not checkable. */
export function extractCommand(scenario: ScenarioBlock): string {
  const match = scenario.intent.match(COMMAND_SPAN);
  return match ? match[1] : "";
}
