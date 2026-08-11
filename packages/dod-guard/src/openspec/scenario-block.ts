// This file contains only type definitions - types are inert at runtime.

/** One `#### Scenario:` under a requirement, reduced to what a leaf needs. */
export interface ScenarioBlock {
  title: string;
  /** The scenario's `THEN` text. A scenario can carry more than one
   * `- **THEN**` bullet (each possibly wrapped across lines); this joins
   * every THEN segment, and every wrapped continuation line within a
   * segment, with a single space so the intent reads as one sentence. */
  intent: string;
}
