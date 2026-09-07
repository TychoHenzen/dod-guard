import type { CandidateName } from "./candidate-name.js";
import type { DiscoveryCandidate } from "./discovery-candidate.js";

export function normalizeValue(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

export function normalizeProjectPath(path: string): string | undefined {
  const portable = path.replace(/\\/g, "/");
  if (unsafePathPrefix(portable)) return undefined;
  const parts = portable
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
  if (parts.includes("..")) return undefined;
  return parts.length === 0 ? undefined : parts.join("/");
}

function unsafePathPrefix(path: string): boolean {
  const firstSegment = path.split("/", 1)[0];
  return (
    path.length === 0 ||
    path.startsWith("/") ||
    path.startsWith("//") ||
    /^[A-Za-z]:($|\/)/.test(path) ||
    firstSegment?.includes(":") === true
  );
}

export function normalizeCandidate(
  candidate: DiscoveryCandidate,
): CandidateName | undefined {
  const path = normalizeProjectPath(candidate.path);
  if (path === undefined) return undefined;
  if (candidate.type === "symbol")
    return {
      candidate: { ...candidate, path },
      values: [normalizeValue(candidate.name)],
    };
  const filename = path.split("/").at(-1) ?? path;
  const stem = filename.replace(/\.[^.]+$/, "");
  return {
    candidate: { ...candidate, path },
    values: [...new Set([normalizeValue(filename), normalizeValue(stem)])],
  };
}
