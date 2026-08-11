// This file contains only type definitions - types are inert at runtime.

import type { OpenSpecDependency } from "./dependency.js";

/**
 * Parsed shape of `openspec instructions dod --change <id> --json`.
 * Field list is pinned against a real CLI capture - see
 * `__fixtures__/instructions.json`.
 */
export interface OpenSpecInstructions {
  changeName: string;
  artifactId: string;
  schemaName: string;
  changeDir: string;
  planningHome: {
    kind: string;
    root: string;
    changesDir: string;
    defaultSchema: string;
  };
  outputPath: string;
  resolvedOutputPath: string;
  existingOutputPaths: string[];
  description: string;
  instruction: string;
  template: string;
  dependencies: OpenSpecDependency[];
  unlocks: unknown[];
  root: {
    path: string;
    source: string;
  };
}
