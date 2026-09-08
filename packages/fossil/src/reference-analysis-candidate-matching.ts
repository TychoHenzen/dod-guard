import type { ReferenceGraph } from "./types.js";

function normalizeCandidatePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/\/(?:index)(?:\.[^/]+)?$/, "")
    .replace(/\.[^/]+$/, "");
}

function basename(path: string): string {
  return normalizeCandidatePath(path).split("/").at(-1) ?? "";
}

export function candidateBasenameCounts(candidates: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const path of candidates) {
    const name = basename(path);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function matchesFullPath(normalizedTarget: string, normalizedCandidate: string): boolean {
  return normalizedCandidate === normalizedTarget || normalizedCandidate.endsWith(`/${normalizedTarget}`);
}

function matchesBasename(
  normalizedTarget: string,
  normalizedCandidate: string,
  basenameCounts: ReadonlyMap<string, number>,
): boolean {
  const name = normalizedTarget.split("/").at(-1) ?? "";
  return normalizedCandidate === normalizedTarget ||
    (basenameCounts.get(name) === 1 && normalizedCandidate.endsWith(`/${name}`));
}

function matchesCandidate(
  normalizedTarget: string,
  candidate: string,
  basenameCounts: ReadonlyMap<string, number>,
): boolean {
  if (!normalizedTarget) return false;
  const normalizedCandidate = normalizeCandidatePath(candidate);
  if (normalizedTarget.includes("/")) return matchesFullPath(normalizedTarget, normalizedCandidate);
  return matchesBasename(normalizedTarget, normalizedCandidate, basenameCounts);
}

function markUnresolvedTarget(
  target: string,
  candidates: readonly string[],
  basenameCounts: ReadonlyMap<string, number>,
  unavailable: Set<string>,
): void {
  const normalizedTarget = normalizeCandidatePath(target);
  if (!normalizedTarget) return;
  for (const candidate of candidates) {
    if (matchesCandidate(normalizedTarget, candidate, basenameCounts)) unavailable.add(candidate);
  }
}

export function markUnresolvedReference(
  unresolved: ReferenceGraph["unresolved"][number],
  candidates: readonly string[],
  basenameCounts: ReadonlyMap<string, number>,
  unavailable: Set<string>,
): void {
  if (unresolved.resolution !== "unresolved") return;
  for (const target of unresolved.targetCandidates)
    markUnresolvedTarget(target, candidates, basenameCounts, unavailable);
}
