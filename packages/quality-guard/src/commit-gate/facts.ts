import { extractArchitectureFacts } from "#quality-guard-architecture-facts";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";

/** Typed bridge to the scanner's zero-dependency parser facts. */
export function extractFactInventory(
  files: Array<{ path: string; content: string }>,
  requiredPaths: string[],
): { files: ArchitectureFileFact[]; errors: string[] } {
  const required = new Set(requiredPaths);
  const errors: string[] = [];
  const facts = files.flatMap((file) => {
    const result = extractArchitectureFacts(file);
    if (required.has(file.path))
      errors.push(...result.errors.map((error) => `${file.path}: ${error}`));
    return result.facts
      ? [
          {
            path: result.facts.path,
            imports: result.facts.imports,
            references: result.facts.references,
            types: result.facts.types,
          },
        ]
      : [];
  });
  return {
    files: facts.sort((left, right) => left.path.localeCompare(right.path)),
    errors: errors.sort((left, right) => left.localeCompare(right)),
  };
}
