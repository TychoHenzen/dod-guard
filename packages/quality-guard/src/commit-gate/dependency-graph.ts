import * as path from "node:path";
import type { QualityConfig } from "./config.js";
import type { DependencyEdge } from "./dependency-edge.js";
import type { DependencyFinding } from "./dependency-finding.js";
import {
  isProductionArchitecturePath,
  normalizeArchitecturePath,
} from "./placement.js";

export {
  forbiddenFindings,
  sortForbiddenFindings,
} from "./dependency-graph-findings.js";

function extensionless(filePath: string): string {
  return filePath.replace(/\.[^/.]+$/, "");
}

function resolveDependency(
  from: string,
  dependency: string,
  paths: Set<string>,
): string | undefined {
  const normalized = normalizeArchitecturePath(dependency);
  const candidate = dependency.startsWith(".")
    ? path.posix.normalize(
        path.posix.join(path.posix.dirname(from), normalized),
      )
    : normalized;
  if (paths.has(candidate)) return candidate;
  const target = extensionless(candidate);
  return [...paths]
    .sort((left, right) => left.localeCompare(right))
    .find((filePath) => extensionless(filePath) === target);
}
export function graph(
  files: Array<{ path: string; imports: string[] }>,
  config: QualityConfig,
): Map<string, DependencyEdge[]> {
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
        .sort(
          (left, right) =>
            left.to.localeCompare(right.to) ||
            left.dependency.localeCompare(right.dependency),
        ),
    ]),
  );
}
function edgeKeys(graphInput: Map<string, DependencyEdge[]>): Set<string> {
  return new Set(
    [...graphInput.values()].flat().map((edge) => `${edge.from}\0${edge.to}`),
  );
}
export function addedEdges(
  before: Map<string, DependencyEdge[]>,
  after: Map<string, DependencyEdge[]>,
  affectedPaths: string[],
): DependencyEdge[] {
  const oldEdges = edgeKeys(before);
  const changed = new Set(affectedPaths.map(normalizeArchitecturePath));
  return [...after.values()]
    .flat()
    .filter(
      (edge) =>
        changed.has(edge.from) && !oldEdges.has(`${edge.from}\0${edge.to}`),
    )
    .sort(
      (left, right) =>
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to) ||
        left.dependency.localeCompare(right.dependency),
    );
}
