import type { DependencyEdge } from "./dependency-edge.js";

function canonicalCycle(cycle: string[]): string[] {
  const open = cycle.slice(0, -1);
  const rotations = open.map((_, index) => [
    ...open.slice(index),
    ...open.slice(0, index),
  ]);
  rotations.sort((left, right) =>
    left.join("\0").localeCompare(right.join("\0")),
  );
  return [...(rotations[0] ?? []), rotations[0]?.[0] ?? ""];
}

function isClosingEdge(
  edge: DependencyEdge,
  start: string,
  trail: string[],
): boolean {
  return edge.to === start && trail.length > 1;
}

function canVisit(
  edge: DependencyEdge,
  start: string,
  trail: string[],
): boolean {
  return !trail.includes(edge.to) && edge.to.localeCompare(start) >= 0;
}

function edgesAt(
  graph: Map<string, DependencyEdge[]>,
  node: string,
): DependencyEdge[] {
  return graph.get(node) ?? [];
}

function visit(input: {
  start: string;
  node: string;
  trail: string[];
  graph: Map<string, DependencyEdge[]>;
  found: Map<string, string[]>;
}): void {
  for (const edge of edgesAt(input.graph, input.node)) {
    if (isClosingEdge(edge, input.start, input.trail)) {
      const cycle = canonicalCycle([...input.trail, input.start]);
      input.found.set(cycle.join("\0"), cycle);
      continue;
    }
    if (!canVisit(edge, input.start, input.trail)) continue;
    visit({ ...input, node: edge.to, trail: [...input.trail, edge.to] });
  }
}

export function findCycles(graph: Map<string, DependencyEdge[]>): string[][] {
  const found = new Map<string, string[]>();
  for (const start of [...graph.keys()].sort((left, right) =>
    left.localeCompare(right),
  )) {
    visit({ start, node: start, trail: [start], graph, found });
  }
  return [...found.values()].sort((left, right) =>
    left.join("\0").localeCompare(right.join("\0")),
  );
}
