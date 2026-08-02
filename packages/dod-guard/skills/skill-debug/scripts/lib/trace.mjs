// Assembling one run into a trace, plus the three counts a reader checks first.
//
// Subagent work is off by default. A skill that dispatches six agents produces
// far more subagent records than orchestrator records. The skill text controls
// the orchestrator. Turn them on when the suspect is an agent brief.

import { stepsOf } from "./steps.mjs";

const AGENT_TOOLS = new Set(["Agent", "Task"]);

function tally(steps) {
  const counts = {
    steps: steps.length,
    tools: 0,
    errors: 0,
    users: 0,
    agents: 0,
  };
  for (const step of steps) {
    counts.tools += step.kind === "tool" ? 1 : 0;
    counts.users += step.kind === "user" ? 1 : 0;
    counts.errors += step.kind === "result" && !step.ok ? 1 : 0;
    counts.agents += step.kind === "tool" && AGENT_TOOLS.has(step.name) ? 1 : 0;
  }
  return counts;
}

export function traceOf(records, run, options = {}) {
  const { sidechains = false, maxSteps = 400 } = options;
  const steps = records
    .slice(run.start, run.end)
    .flatMap(stepsOf)
    .filter((step) => sidechains || !step.sidechain);
  return {
    steps: steps.slice(0, maxSteps),
    counts: tally(steps),
    truncated: steps.length > maxSteps,
  };
}
