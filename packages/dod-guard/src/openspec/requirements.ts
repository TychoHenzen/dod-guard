import type { RequirementBlock } from "./requirement-block.js";
import type { ScenarioBlock } from "./scenario-block.js";

const REQUIREMENT_HEADING = /^### Requirement:\s*(.+?)\s*$/;
const SCENARIO_HEADING = /^#### Scenario:\s*(.+?)\s*$/;
// The `## ADDED|MODIFIED|REMOVED|RENAMED Requirements` heading a delta groups
// its requirements under. `##` plus space never matches `### Requirement:`.
const SECTION_HEADING = /^##\s+(.+?)\s*$/;
const REMOVED_SECTION = /^REMOVED\b/i;
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
  /** Inside `## REMOVED Requirements`, whose requirements name deleted behavior. */
  inRemoved: boolean;
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

/** A removed requirement emits no block: no work can satisfy a requirement the
 * change deletes, and its scenario-less group would hold the DoD at INCOMPLETE
 * forever. `currentReq` stays null, so its scenarios drop with it. */
function startRequirement(state: ParseState, title: string): void {
  state.currentReq = state.inRemoved ? null : { title, scenarios: [] };
  if (state.currentReq) state.blocks.push(state.currentReq);
}

/** Section, requirement and scenario headings, each of which ends the scenario
 * before it. Returns true when the line was one of them. */
function consumeHeading(state: ParseState, line: string): boolean {
  const section = line.match(SECTION_HEADING);
  if (section) {
    finalizeScenario(state);
    state.currentReq = null; // a scenario stranded here must not attach upward
    state.inRemoved = REMOVED_SECTION.test(section[1]);
    return true;
  }
  const requirement = line.match(REQUIREMENT_HEADING);
  if (requirement) {
    finalizeScenario(state);
    startRequirement(state, requirement[1]);
    return true;
  }
  const scenario = line.match(SCENARIO_HEADING);
  if (scenario) {
    finalizeScenario(state);
    state.currentScenario = { title: scenario[1], intent: "" };
    return true;
  }
  return false;
}

function consumeLine(state: ParseState, line: string): void {
  if (consumeHeading(state, line)) return;

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

function newState(): ParseState {
  return { blocks: [], currentReq: null, currentScenario: null, thenParts: [], inThen: false, inRemoved: false };
}

/** Pull every `### Requirement:` heading out of a spec delta's markdown, each
 * carrying the `#### Scenario:` blocks under it, in document order. One under
 * `## REMOVED Requirements` is left out; one before any section heading counts. */
export function extractRequirementBlocks(content: string): RequirementBlock[] {
  const state = newState();
  for (const line of content.split("\n")) consumeLine(state, line);
  finalizeScenario(state);
  return state.blocks;
}
