import type { QualityConfig } from "./config.js";
import type { ArchitectureFileFact } from "./encapsulation.js";
import { analyzeRefactorProgress, type RefactorProgress } from "./refactor-progress.js";

export interface Responsibility {
  name: string;
  currentOwners: string[];
  consumers: string[];
  dependencies: string[];
}

export interface ResponsibilityMap {
  targetScope: string[];
  responsibilities: Responsibility[];
  desired: {
    ownership: Array<{ responsibility: string; owner: string }>;
    boundaries: Array<{ from: string; to: string; allowed: boolean }>;
  };
}

export interface ResponsibilityMapEvaluation extends RefactorProgress {
  hasDeclaredOutcomeProgress: boolean;
  outcomes: Array<{ description: string; before: boolean; after: boolean }>;
}

function object(value: unknown, location: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${location} must be an object`);
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: string[], location: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${location}.${key} is not supported`);
}

function strings(value: unknown, location: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`${location} must be an array of non-empty strings`);
  const result = value.map((item) => (item as string).trim());
  if (new Set(result).size !== result.length) throw new Error(`${location} contains duplicates`);
  return result;
}

function string(value: unknown, location: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${location} must be a non-empty string`);
  return value.trim();
}

/**
 * Parses the staged --target JSON schema:
 * { targetScope: string[], responsibilities: [{ name, currentOwners, consumers, dependencies }],
 *   desired: { ownership: [{ responsibility, owner }], boundaries: [{ from, to, allowed }] } }.
 * Every array is required. desired must name at least one ownership or boundary outcome.
 */
export function parseResponsibilityMap(source: string): ResponsibilityMap {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("responsibility map must contain valid JSON");
  }
  const root = object(parsed, "responsibility map");
  onlyKeys(root, ["targetScope", "responsibilities", "desired"], "responsibility map");
  const targetScope = strings(root.targetScope, "responsibility map.targetScope");
  if (targetScope.length === 0) throw new Error("responsibility map.targetScope must not be empty");
  if (!Array.isArray(root.responsibilities) || root.responsibilities.length === 0) throw new Error("responsibility map.responsibilities must be a non-empty array");
  const responsibilities = root.responsibilities.map((item, index) => {
    const responsibility = object(item, `responsibility map.responsibilities[${index}]`);
    onlyKeys(responsibility, ["name", "currentOwners", "consumers", "dependencies"], `responsibility map.responsibilities[${index}]`);
    return {
      name: string(responsibility.name, `responsibility map.responsibilities[${index}].name`),
      currentOwners: strings(responsibility.currentOwners, `responsibility map.responsibilities[${index}].currentOwners`),
      consumers: strings(responsibility.consumers, `responsibility map.responsibilities[${index}].consumers`),
      dependencies: strings(responsibility.dependencies, `responsibility map.responsibilities[${index}].dependencies`),
    };
  });
  if (responsibilities.some((responsibility) => responsibility.currentOwners.length === 0)) {
    throw new Error("responsibility map responsibilities require at least one current owner");
  }
  const desired = object(root.desired, "responsibility map.desired");
  onlyKeys(desired, ["ownership", "boundaries"], "responsibility map.desired");
  if (!Array.isArray(desired.ownership) || !Array.isArray(desired.boundaries)) throw new Error("responsibility map.desired requires ownership and boundaries arrays");
  const ownership = desired.ownership.map((item, index) => {
    const outcome = object(item, `responsibility map.desired.ownership[${index}]`);
    onlyKeys(outcome, ["responsibility", "owner"], `responsibility map.desired.ownership[${index}]`);
    return { responsibility: string(outcome.responsibility, `responsibility map.desired.ownership[${index}].responsibility`), owner: string(outcome.owner, `responsibility map.desired.ownership[${index}].owner`) };
  });
  const boundaries = desired.boundaries.map((item, index) => {
    const outcome = object(item, `responsibility map.desired.boundaries[${index}]`);
    onlyKeys(outcome, ["from", "to", "allowed"], `responsibility map.desired.boundaries[${index}]`);
    if (typeof outcome.allowed !== "boolean") throw new Error(`responsibility map.desired.boundaries[${index}].allowed must be boolean`);
    return { from: string(outcome.from, `responsibility map.desired.boundaries[${index}].from`), to: string(outcome.to, `responsibility map.desired.boundaries[${index}].to`), allowed: outcome.allowed };
  });
  if (ownership.length + boundaries.length === 0) throw new Error("responsibility map.desired must contain an ownership or boundary outcome");
  return { targetScope, responsibilities, desired: { ownership, boundaries } };
}

function owns(files: ArchitectureFileFact[], responsibility: string, owner: string): boolean {
  return files.some((file) => file.types.some((type) => type.name === owner && type.members.some((member) => member.kind === "method" && member.name === responsibility)));
}

function hasDependency(files: ArchitectureFileFact[], from: string, to: string): boolean {
  return files.some((file) => file.types.some((type) => type.name === from && type.dependencies.includes(to)));
}

export function evaluateResponsibilityMap(map: ResponsibilityMap, before: ArchitectureFileFact[], after: ArchitectureFileFact[], config: QualityConfig): ResponsibilityMapEvaluation {
  const progress = analyzeRefactorProgress(before, after, map.targetScope, config);
  const outcomes = [
    ...map.desired.ownership.map((outcome) => ({ description: `${outcome.responsibility} is owned by ${outcome.owner}`, before: owns(before, outcome.responsibility, outcome.owner), after: owns(after, outcome.responsibility, outcome.owner) })),
    ...map.desired.boundaries.map((outcome) => ({ description: `${outcome.from} -> ${outcome.to} is ${outcome.allowed ? "allowed" : "absent"}`, before: hasDependency(before, outcome.from, outcome.to) === outcome.allowed, after: hasDependency(after, outcome.from, outcome.to) === outcome.allowed })),
  ];
  return { ...progress, outcomes, hasDeclaredOutcomeProgress: outcomes.some((outcome) => !outcome.before && outcome.after) };
}
