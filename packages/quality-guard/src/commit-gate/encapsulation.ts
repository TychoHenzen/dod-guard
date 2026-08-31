import { execFileSync } from "node:child_process";
import type { QualityConfig } from "./config.js";
import { isProductionArchitecturePath, normalizeArchitecturePath } from "./placement.js";

export type ArchitectureMemberKind = "method" | "field";
export type ArchitectureVisibility = "public" | "private" | "protected" | "internal";

export interface ArchitectureMemberFact {
  name: string;
  kind: ArchitectureMemberKind;
  visibility: ArchitectureVisibility;
}

export interface ForwardingPathFact {
  member: string;
  target: string;
}

export interface ArchitectureTypeFact {
  name: string;
  members: ArchitectureMemberFact[];
  dependencies: string[];
  forwardingPaths: ForwardingPathFact[];
}

/** A full source inventory is required because callers can be outside the changed files. */
export interface ArchitectureFileFact {
  path: string;
  imports: string[];
  references: string[];
  types: ArchitectureTypeFact[];
}

export type EncapsulationFinding =
  | { kind: "public-surface-growth" | "test-only-seam"; path: string; symbol: string; productionCallers: string[]; testCallers: string[] }
  | { kind: "forwarding-path"; path: string; type: string; member: string; target: string };

export interface LocalityFinding {
  kind: "outside-change-cluster";
  path: string;
  historyWindow: number;
  fileChangeCount: number;
  coChangeCount: number;
  comparedPaths: string[];
}

interface HistoryCommit {
  paths: string[];
}

function key(type: ArchitectureTypeFact, member: ArchitectureMemberFact): string {
  return `${type.name}.${member.name}`;
}

function members(type: ArchitectureTypeFact): Set<string> {
  return new Set(type.members.filter((member) => member.visibility === "public").map((member) => `${member.kind}\0${member.name}`));
}

function observedCallers(symbol: string, files: ArchitectureFileFact[], config: QualityConfig): { productionCallers: string[]; testCallers: string[] } {
  const productionCallers: string[] = [];
  const testCallers: string[] = [];
  for (const file of files) {
    const path = normalizeArchitecturePath(file.path);
    if (!file.references.some((reference) => reference === symbol || reference.endsWith(`.${symbol}`))) continue;
    if (isProductionArchitecturePath(path, config)) productionCallers.push(path);
    else testCallers.push(path);
  }
  return { productionCallers: [...new Set(productionCallers)].sort(), testCallers: [...new Set(testCallers)].sort() };
}

function forwardingKeys(type: ArchitectureTypeFact): Set<string> {
  return new Set(type.forwardingPaths.map((path) => `${path.member}\0${path.target}`));
}

/**
 * Reports review evidence only. Full before and staged inventories let it distinguish
 * a new public seam with no production caller from a symbol used elsewhere in the tree.
 */
export function analyzeEncapsulation(
  beforeFiles: ArchitectureFileFact[],
  afterFiles: ArchitectureFileFact[],
  affectedPaths: string[],
  config: QualityConfig,
): EncapsulationFinding[] {
  const beforeByPath = new Map(beforeFiles.map((file) => [normalizeArchitecturePath(file.path), file]));
  const affected = new Set(affectedPaths.map(normalizeArchitecturePath));
  const findings: EncapsulationFinding[] = [];
  for (const afterFile of afterFiles) {
    const filePath = normalizeArchitecturePath(afterFile.path);
    if (!affected.has(filePath) || !isProductionArchitecturePath(filePath, config)) continue;
    const beforeTypes = new Map((beforeByPath.get(filePath)?.types ?? []).map((type) => [type.name, type]));
    for (const type of afterFile.types) {
      const previous = beforeTypes.get(type.name);
      const priorMembers = previous ? members(previous) : new Set<string>();
      for (const member of type.members.filter((item) => item.visibility === "public")) {
        if (priorMembers.has(`${member.kind}\0${member.name}`)) continue;
        const symbol = key(type, member);
        const callers = observedCallers(symbol, afterFiles, config);
        findings.push({ kind: "public-surface-growth", path: filePath, symbol, ...callers });
        if (callers.productionCallers.length === 0 && callers.testCallers.length > 0) {
          findings.push({ kind: "test-only-seam", path: filePath, symbol, ...callers });
        }
      }
      const priorForwarding = previous ? forwardingKeys(previous) : new Set<string>();
      for (const path of type.forwardingPaths) {
        if (!priorForwarding.has(`${path.member}\0${path.target}`)) {
          findings.push({ kind: "forwarding-path", path: filePath, type: type.name, member: path.member, target: path.target });
        }
      }
    }
  }
  return findings.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

/** Reads only a bounded first-parent window. It is evidence for review, never a failure. */
export function readFirstParentHistory(root: string, maxFirstParentCommits: number): HistoryCommit[] {
  const output = execFileSync("git", ["log", "--first-parent", `-n${maxFirstParentCommits}`, "--format=%x00%H", "--name-only", "-z", "HEAD"], {
    cwd: root,
    encoding: "buffer",
  });
  const commits: HistoryCommit[] = [];
  let current: string[] | undefined;
  for (const value of output.toString("utf8").split("\0")) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (/^[0-9a-f]{40}$/i.test(normalized)) {
      if (current) commits.push({ paths: [...new Set(current)].sort() });
      current = [];
    } else if (current) {
      current.push(normalizeArchitecturePath(normalized));
    }
  }
  if (current) commits.push({ paths: [...new Set(current)].sort() });
  return commits;
}

/** A zero co-change count in the configured window makes a changed file a review finding. */
export function analyzeChangeLocality(root: string, affectedPaths: string[], config: QualityConfig): LocalityFinding[] {
  const paths = [...new Set(affectedPaths.map(normalizeArchitecturePath))].sort();
  const commits = readFirstParentHistory(root, config.history.maxFirstParentCommits);
  return paths
    .flatMap((filePath) => {
      const comparedPaths = paths.filter((path) => path !== filePath);
      if (comparedPaths.length === 0) return [];
      const containing = commits.filter((commit) => commit.paths.includes(filePath));
      const coChangeCount = containing.filter((commit) => comparedPaths.some((path) => commit.paths.includes(path))).length;
      return coChangeCount === 0 && containing.length > 0
        ? [{ kind: "outside-change-cluster" as const, path: filePath, historyWindow: commits.length, fileChangeCount: containing.length, coChangeCount, comparedPaths }]
        : [];
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}
