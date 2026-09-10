import type { QualityConfig } from "./config.js";
import type { DependencyEdge } from "./dependency-edge.js";
import type { DependencyFinding } from "./dependency-finding.js";
import { matchesArchitecturePath } from "./placement.js";

function groupFor(
  filePath: string,
  groups: Record<string, string[]>,
): string[] {
  return Object.entries(groups)
    .filter(([, patterns]) =>
      patterns.some((pattern) => matchesArchitecturePath(filePath, pattern)),
    )
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
}

function directionForbidden(
  config: QualityConfig,
  fromGroup: string,
  toGroup: string,
): boolean {
  return config.dependencyDirections.some(
    (rule) => rule.from === fromGroup && rule.to === toGroup && !rule.allowed,
  );
}

export function forbiddenFindings(
  edges: DependencyEdge[],
  config: QualityConfig,
): DependencyFinding[] {
  return edges.flatMap((edge) =>
    groupFor(edge.from, config.pathGroups).flatMap((fromGroup) =>
      groupFor(edge.to, config.pathGroups).flatMap((toGroup) =>
        directionForbidden(config, fromGroup, toGroup)
          ? [
              {
                kind: "forbidden-direction" as const,
                ...edge,
                fromGroup,
                toGroup,
              },
            ]
          : [],
      ),
    ),
  );
}

export function sortForbiddenFindings(
  findings: DependencyFinding[],
): DependencyFinding[] {
  return findings.sort((left, right) => {
    if (left.kind === "cycle" || right.kind === "cycle")
      return JSON.stringify(left).localeCompare(JSON.stringify(right));
    const leftKey = [left.from, left.to, left.fromGroup, left.toGroup].join(
      "\0",
    );
    const rightKey = [
      right.from,
      right.to,
      right.fromGroup,
      right.toGroup,
    ].join("\0");
    return leftKey.localeCompare(rightKey);
  });
}
