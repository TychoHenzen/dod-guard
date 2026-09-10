import * as path from "node:path";
import type { QualityConfig } from "./config.js";

type MetricType = {
  path: string;
  type: { members: Array<{ visibility: string }>; forwardingPaths: unknown[] };
};

export function directTypePressure(
  types: MetricType[],
  config: QualityConfig,
): number {
  const counts = new Map<string, number>();
  for (const item of types) {
    const directory = path.posix.dirname(item.path);
    counts.set(directory, (counts.get(directory) ?? 0) + 1);
  }
  return [...counts.values()].reduce(
    (total, count) => total + Math.max(0, count - config.directTypeLimit),
    0,
  );
}

export function publicSurfaceCount(types: MetricType[]): number {
  return types.reduce(
    (total, item) =>
      total +
      item.type.members.filter((member) => member.visibility === "public")
        .length,
    0,
  );
}

export function compatibilityPathCount(types: MetricType[]): number {
  return types.reduce(
    (total, item) => total + item.type.forwardingPaths.length,
    0,
  );
}
