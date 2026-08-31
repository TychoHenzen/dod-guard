import { extractArchitectureFacts } from "../../skills/quality-refactor/scripts/lib/architecture-facts.mjs";
import type { ArchitectureFileFact } from "./encapsulation.js";
import type { SnapshotFile } from "./snapshot.js";

export interface FactInventory {
  files: ArchitectureFileFact[];
  errors: string[];
}

/** Typed bridge to the scanner's zero-dependency parser facts. */
export function extractFactInventory(files: SnapshotFile[], requiredPaths: string[]): FactInventory {
  const required = new Set(requiredPaths);
  const errors: string[] = [];
  const facts = files.flatMap((file) => {
    const result = extractArchitectureFacts(file);
    if (required.has(file.path)) errors.push(...result.errors.map((error) => `${file.path}: ${error}`));
    return result.facts ? [{ path: result.facts.path, imports: result.facts.imports, references: result.facts.references, types: result.facts.types }] : [];
  });
  return { files: facts.sort((left, right) => left.path.localeCompare(right.path)), errors: errors.sort((left, right) => left.localeCompare(right)) };
}
