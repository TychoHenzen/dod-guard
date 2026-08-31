import * as path from "node:path";
import type { QualityConfig } from "./config.js";
import type { ArchitectureFileFact, ArchitectureTypeFact } from "./encapsulation.js";
import { isProductionArchitecturePath, normalizeArchitecturePath } from "./placement.js";

export type ProgressStatus = "improved" | "regressed" | "unchanged";

export interface ProgressIndicator {
  status: ProgressStatus;
  before: number;
  after: number;
  details: string[];
}

export interface OwnershipMove {
  operation: string;
  from: string;
  to: string;
}

export interface RefactorProgress {
  ownershipMoves: OwnershipMove[];
  indicators: {
    ownership: ProgressIndicator;
    dependencyEdges: ProgressIndicator;
    placement: ProgressIndicator;
    publicSurface: ProgressIndicator;
    compatibilityPaths: ProgressIndicator;
  };
  hasArchitecturalProgress: boolean;
}

interface TypeAtPath {
  path: string;
  type: ArchitectureTypeFact;
}

function productionTypes(files: ArchitectureFileFact[], config: QualityConfig): TypeAtPath[] {
  return files
    .filter((file) => isProductionArchitecturePath(file.path, config))
    .flatMap((file) => file.types.map((type) => ({ path: normalizeArchitecturePath(file.path), type })))
    .sort((left, right) => left.path.localeCompare(right.path) || left.type.name.localeCompare(right.type.name));
}

function operations(types: TypeAtPath[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const item of types) {
    for (const member of item.type.members.filter((member) => member.kind === "method")) {
      const owners = result.get(member.name) ?? [];
      owners.push(item.type.name);
      result.set(member.name, owners);
    }
  }
  for (const owners of result.values()) owners.sort();
  return result;
}

function ownershipMoves(before: TypeAtPath[], after: TypeAtPath[]): OwnershipMove[] {
  const beforeOperations = operations(before);
  const afterOperations = operations(after);
  const moves: OwnershipMove[] = [];
  for (const [operation, oldOwners] of beforeOperations) {
    const newOwners = afterOperations.get(operation);
    if (!newOwners || oldOwners.length !== 1 || newOwners.length !== 1 || oldOwners[0] === newOwners[0]) continue;
    moves.push({ operation, from: oldOwners[0] as string, to: newOwners[0] as string });
  }
  return moves.sort((left, right) => left.operation.localeCompare(right.operation) || left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
}

function dependencyKeys(types: TypeAtPath[]): Set<string> {
  return new Set(types.flatMap((item) => item.type.dependencies.map((dependency) => `${item.type.name}\0${dependency}`)));
}

function dependencyReduction(moves: OwnershipMove[], before: TypeAtPath[], after: TypeAtPath[]): string[] {
  const beforeTypes = new Map(before.map((item) => [item.type.name, item.type]));
  const afterTypes = new Map(after.map((item) => [item.type.name, item.type]));
  return moves.flatMap((move) => {
    const oldDependencies = beforeTypes.get(move.from)?.dependencies ?? [];
    const newDependencies = afterTypes.get(move.from)?.dependencies ?? [];
    return oldDependencies
      .filter((dependency) => !newDependencies.includes(dependency))
      .sort()
      .map((dependency) => `${move.from} no longer depends on ${dependency}`);
  });
}

function directTypePressure(types: TypeAtPath[], config: QualityConfig): number {
  const counts = new Map<string, number>();
  for (const item of types) {
    const directory = path.posix.dirname(item.path);
    counts.set(directory, (counts.get(directory) ?? 0) + 1);
  }
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - config.directTypeLimit), 0);
}

function publicSurfaceCount(types: TypeAtPath[]): number {
  return types.reduce((total, item) => total + item.type.members.filter((member) => member.visibility === "public").length, 0);
}

function compatibilityPathCount(types: TypeAtPath[]): number {
  return types.reduce((total, item) => total + item.type.forwardingPaths.length, 0);
}

function statusFromCounts(before: number, after: number): ProgressStatus {
  if (after < before) return "improved";
  if (after > before) return "regressed";
  return "unchanged";
}

/**
 * Compares complete base and staged inventories. It intentionally has no local scanner
 * metric input, so a rename, reformat, or local metric reduction cannot claim progress.
 */
export function analyzeRefactorProgress(
  beforeFiles: ArchitectureFileFact[],
  afterFiles: ArchitectureFileFact[],
  _affectedPaths: string[],
  config: QualityConfig,
): RefactorProgress {
  const before = productionTypes(beforeFiles, config);
  const after = productionTypes(afterFiles, config);
  const moves = ownershipMoves(before, after);
  const beforeDependencies = dependencyKeys(before);
  const afterDependencies = dependencyKeys(after);
  const reductions = dependencyReduction(moves, before, after);
  const ownership: ProgressIndicator = {
    status: moves.length > 0 ? "improved" : "unchanged",
    before: operations(before).size,
    after: operations(after).size,
    details: moves.map((move) => `${move.operation}: ${move.from} -> ${move.to}`),
  };
  const dependencyEdges: ProgressIndicator = {
    status: reductions.length > 0 ? "improved" : statusFromCounts(beforeDependencies.size, afterDependencies.size),
    before: beforeDependencies.size,
    after: afterDependencies.size,
    details: reductions,
  };
  const placement: ProgressIndicator = {
    status: statusFromCounts(directTypePressure(before, config), directTypePressure(after, config)),
    before: directTypePressure(before, config),
    after: directTypePressure(after, config),
    details: [],
  };
  const publicSurface: ProgressIndicator = {
    status: statusFromCounts(publicSurfaceCount(before), publicSurfaceCount(after)),
    before: publicSurfaceCount(before),
    after: publicSurfaceCount(after),
    details: [],
  };
  const compatibility: ProgressIndicator = {
    status: statusFromCounts(compatibilityPathCount(before), compatibilityPathCount(after)),
    before: compatibilityPathCount(before),
    after: compatibilityPathCount(after),
    details: [],
  };
  const indicators = { ownership, dependencyEdges, placement, publicSurface, compatibilityPaths: compatibility };
  return { ownershipMoves: moves, indicators, hasArchitecturalProgress: Object.values(indicators).some((indicator) => indicator.status === "improved") };
}
