import type { QualityConfig } from "./config.js";
import { findCycles } from "./dependency-cycles.js";
import type { DependencyEdge } from "./dependency-edge.js";
import type { DependencyFinding } from "./dependency-finding.js";
import { addedEdges, graph } from "./dependency-graph.js";
import {
  forbiddenFindings,
  sortForbiddenFindings,
} from "./dependency-graph-findings.js";

export type { DependencyEdge } from "./dependency-edge.js";

function cycleFinding(input: {
  cycle: string[];
  after: Map<string, DependencyEdge[]>;
  beforeCycles: Set<string>;
  stagedEdges: DependencyEdge[];
}): DependencyFinding[] {
  if (input.beforeCycles.has(input.cycle.join("\0"))) return [];
  const cycleEdges = edgesForCycle(input.cycle, input.after);
  const stagedEdge = stagedEdgeFor(cycleEdges, input.stagedEdges);
  return stagedEdge ? [{ kind: "cycle", cycle: input.cycle, stagedEdge }] : [];
}

function edgesForCycle(
  cycle: string[],
  after: Map<string, DependencyEdge[]>,
): DependencyEdge[] {
  return cycle
    .slice(0, -1)
    .flatMap((from, index) =>
      (after.get(from) ?? []).filter((edge) => edge.to === cycle[index + 1]),
    );
}

function stagedEdgeFor(
  cycleEdges: DependencyEdge[],
  stagedEdges: DependencyEdge[],
): DependencyEdge | undefined {
  return cycleEdges.find((edge) =>
    stagedEdges.some(
      (added) => added.from === edge.from && added.to === edge.to,
    ),
  );
}

function cycleFindings(
  before: Map<string, DependencyEdge[]>,
  after: Map<string, DependencyEdge[]>,
  stagedEdges: DependencyEdge[],
): DependencyFinding[] {
  const beforeCycles = new Set(
    findCycles(before).map((cycle) => cycle.join("\0")),
  );
  return findCycles(after).flatMap((cycle) =>
    cycleFinding({ cycle, after, beforeCycles, stagedEdges }),
  );
}

export function analyzeDependencies(input: {
  beforeFiles: Array<{ path: string; imports: string[] }>;
  afterFiles: Array<{ path: string; imports: string[] }>;
  affectedPaths: string[];
  config: QualityConfig;
}) {
  const before = graph(input.beforeFiles, input.config);
  const after = graph(input.afterFiles, input.config);
  const stagedEdges = addedEdges(before, after, input.affectedPaths);
  return sortForbiddenFindings([
    ...forbiddenFindings(stagedEdges, input.config),
    ...cycleFindings(before, after, stagedEdges),
  ]);
}
