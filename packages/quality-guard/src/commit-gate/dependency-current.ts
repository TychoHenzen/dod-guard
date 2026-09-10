import type { QualityConfig } from "./config.js";
import { findCycles } from "./dependency-cycles.js";
import {
  forbiddenFindings,
  graph,
  sortForbiddenFindings,
} from "./dependency-graph.js";

export function analyzeCurrentDependencies(
  files: Array<{ path: string; imports: string[] }>,
  config: QualityConfig,
) {
  const current = graph(files, config);
  return {
    dependencies: sortForbiddenFindings(
      forbiddenFindings([...current.values()].flat(), config),
    ),
    cycles: findCycles(current).map((cycle) => ({
      kind: "cycle" as const,
      cycle,
    })),
  };
}
