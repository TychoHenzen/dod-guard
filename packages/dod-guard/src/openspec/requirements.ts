import type { RequirementBlock } from "./requirement-block.js";
import type { ScenarioBlock } from "./scenario-block.js";

const REQUIREMENT_HEADING = /^### Requirement:\s*(.+?)\s*$/;
const SCENARIO_HEADING = /^#### Scenario:\s*(.+?)\s*$/;
const THEN_LINE = /^-\s*\*\*THEN\*\*\s*(.*)$/;
// Any other `- **WORD**` bullet (WHEN, AND, GIVEN, ...) ends a THEN run
// without starting a new one.
const OTHER_BULLET = /^-\s*\*\*[A-Z]+\*\*/;

interface ParseState {
  blocks: RequirementBlock[];
  currentReq: RequirementBlock | null;
  currentScenario: ScenarioBlock | null;
  thenParts: string[];
  inThen: boolean;
}

function finalizeScenario(state: ParseState): void {
  if (state.currentScenario && state.currentReq) {
    state.currentScenario.intent = state.thenParts.join(" ");
    state.currentReq.scenarios.push(state.currentScenario);
  }
  state.currentScenario = null;
  state.thenParts = [];
  state.inThen = false;
}

function consumeLine(state: ParseState, line: string): void {
  const reqMatch = line.match(REQUIREMENT_HEADING);
  if (reqMatch) {
    finalizeScenario(state);
    state.currentReq = { title: reqMatch[1], scenarios: [] };
    state.blocks.push(state.currentReq);
    return;
  }
  const scenarioMatch = line.match(SCENARIO_HEADING);
  if (scenarioMatch) {
    finalizeScenario(state);
    state.currentScenario = { title: scenarioMatch[1], intent: "" };
    return;
  }
  const thenMatch = line.match(THEN_LINE);
  if (thenMatch) {
    state.thenParts.push(thenMatch[1].trim());
    state.inThen = true;
    return;
  }
  if (OTHER_BULLET.test(line)) {
    state.inThen = false;
    return;
  }
  if (state.inThen && line.trim().length > 0) {
    const lastIndex = state.thenParts.length - 1;
    state.thenParts[lastIndex] = `${state.thenParts[lastIndex]} ${line.trim()}`;
  }
}

/**
 * Pull every `### Requirement:` heading out of a spec delta's markdown,
 * each carrying the `#### Scenario:` blocks found under it before the next
 * requirement heading, in document order.
 */
export function extractRequirementBlocks(content: string): RequirementBlock[] {
  const state: ParseState = { blocks: [], currentReq: null, currentScenario: null, thenParts: [], inThen: false };
  for (const line of content.split("\n")) {
    consumeLine(state, line);
  }
  finalizeScenario(state);
  return state.blocks;
}
