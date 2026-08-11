// This file contains only type definitions - types are inert at runtime.

import type { ScenarioBlock } from "./scenario-block.js";

/** One `### Requirement:` heading and the scenarios found under it, in
 * document order. Scenario bodies before the first requirement heading
 * (none expected in practice) are dropped. */
export interface RequirementBlock {
  title: string;
  scenarios: ScenarioBlock[];
}
