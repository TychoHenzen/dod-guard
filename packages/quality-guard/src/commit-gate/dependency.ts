import * as path from "node:path";
import type { QualityConfig } from "./config.js";
import { isProductionArchitecturePath, matchesArchitecturePath, normalizeArchitecturePath } from "./placement.js";

export interface ProductionDependencyFile {
  path: string;
  imports: string[];
}

interface DependencyEdge {
  from: string;
  to: string;
  dependency: string;
}

export type DependencyFinding =
  | { kind: "forbidden-direction"; from: string; to: string; dependency: string; fromGroup: string; toGroup: string }
  | { kind: "cycle"; cycle: string[]; stagedEdge: DependencyEdge };

function extensionless(filePath: string): string {
  return filePath.replace(/\.[^/.]+$/, "");
}

function resolveDependency(from: string, dependency: string, paths: Set<string>): string | undefined {
  const normalized = normalizeArchitecturePath(dependency);
  const candidate = dependency.startsWith(".")
    ? path.posix.normalize(path.posix.join(path.posix.dirname(from), normalized))
    : normalized;
  if (paths.has(candidate)) return candidate;
  const target = extensionless(candidate);
  return [...paths]
    .sort((left, right) => left.localeCompare(right))
    .find((filePath) => extensionless(filePath) === target);
}

function graph(files: ProductionDependencyFile[], config: QualityConfig): Map<string, DependencyEdge[]> {
  const production = files
    .filter((file) => isProductionArchitecturePath(file.path, config))
    .map((file) => ({ ...file, path: normalizeArchitecturePath(file.path) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const paths = new Set(production.map((file) => file.path));
  return new Map(
    production.map((file) => [
      file.path,
      file.imports
        .map((dependency) => {
          const to = resolveDependency(file.path, dependency, paths);
          return to ? { from: file.path, to, dependency } : undefined;
        })
        .filter((edge): edge is DependencyEdge => edge !== undefined)
        .sort((left, right) => left.to.localeCompare(right.to) || left.dependency.localeCompare(right.dependency)),
    ]),
  );
}

function edgeKeys(graphInput: Map<string, DependencyEdge[]>): Set<string> {
  return new Set([...graphInput.values()].flat().map((edge) => `${edge.from}\0${edge.to}`));
}

function groupFor(filePath: string, groups: Record<string, string[]>): string[] {
  return Object.entries(groups)
    .filter(([, patterns]) => patterns.some((pattern) => matchesArchitecturePath(filePath, pattern)))
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
}

function canonicalCycle(cycle: string[]): string[] {
  const open = cycle.slice(0, -1);
  const rotations = open.map((_, index) => [...open.slice(index), ...open.slice(0, index)]);
  rotations.sort((left, right) => left.join("\0").localeCompare(right.join("\0")));
  return [...(rotations[0] ?? []), rotations[0]?.[0] ?? ""];
}

function cycles(graphInput: Map<string, DependencyEdge[]>): string[][] {
  const found = new Map<string, string[]>();
  const nodes = [...graphInput.keys()].sort((left, right) => left.localeCompare(right));
  for (const start of nodes) {
    const visit = (node: string, trail: string[]): void => {
      for (const edge of graphInput.get(node) ?? []) {
        if (edge.to === start && trail.length > 1) {
          const cycle = canonicalCycle([...trail, start]);
          found.set(cycle.join("\0"), cycle);
        } else if (!trail.includes(edge.to) && edge.to.localeCompare(start) >= 0) {
          visit(edge.to, [...trail, edge.to]);
        }
      }
    };
    visit(start, [start]);
  }
  return [...found.values()].sort((left, right) => left.join("\0").localeCompare(right.join("\0")));
}

/** Builds a deterministic production-only graph from shared parser import facts. */
export function analyzeDependencies(
  beforeFiles: ProductionDependencyFile[],
  afterFiles: ProductionDependencyFile[],
  affectedPaths: string[],
  config: QualityConfig,
): DependencyFinding[] {
  const before = graph(beforeFiles, config);
  const after = graph(afterFiles, config);
  const oldEdges = edgeKeys(before);
  const changed = new Set(affectedPaths.map(normalizeArchitecturePath));
  const stagedEdges = [...after.values()]
    .flat()
    .filter((edge) => changed.has(edge.from) && !oldEdges.has(`${edge.from}\0${edge.to}`))
    .sort(
      (left, right) =>
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to) ||
        left.dependency.localeCompare(right.dependency),
    );
  const findings: DependencyFinding[] = [];

  for (const edge of stagedEdges) {
    for (const fromGroup of groupFor(edge.from, config.pathGroups)) {
      for (const toGroup of groupFor(edge.to, config.pathGroups)) {
        if (
          config.dependencyDirections.some((rule) => rule.from === fromGroup && rule.to === toGroup && !rule.allowed)
        ) {
          findings.push({ kind: "forbidden-direction", ...edge, fromGroup, toGroup });
        }
      }
    }
  }

  const beforeCycles = new Set(cycles(before).map((cycle) => cycle.join("\0")));
  for (const cycle of cycles(after)) {
    if (beforeCycles.has(cycle.join("\0"))) continue;
    const cycleEdges = cycle
      .slice(0, -1)
      .flatMap((from, index) => (after.get(from) ?? []).filter((edge) => edge.to === cycle[index + 1]));
    const stagedEdge = cycleEdges.find((edge) =>
      stagedEdges.some((added) => added.from === edge.from && added.to === edge.to),
    );
    if (stagedEdge) findings.push({ kind: "cycle", cycle, stagedEdge });
  }
  return findings.sort((left, right) => {
    const leftKey = left.kind === "cycle" ? `cycle:${left.cycle.join("\0")}` : `forbidden:${left.from}\0${left.to}`;
    const rightKey =
      right.kind === "cycle" ? `cycle:${right.cycle.join("\0")}` : `forbidden:${right.from}\0${right.to}`;
    return leftKey.localeCompare(rightKey);
  });
}
