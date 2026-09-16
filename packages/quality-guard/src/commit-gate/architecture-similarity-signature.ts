import * as path from "node:path";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { normalizeArchitecturePath } from "./placement-paths.js";

const IGNORED_TOKENS = new Set(
  (
    "async class common const default export function get index interface " +
    "internal private protected set shared src static test tests type " +
    "typescript utils ts tsx mts cts js jsx mjs cjs cs rs py go java kt c cc " +
    "cpp cxx h hpp"
  ).split(" "),
);

function similarityTokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !IGNORED_TOKENS.has(token));
}

function addTokens(
  signature: Map<string, number>,
  value: string,
  weight: number,
): void {
  for (const token of similarityTokens(value))
    signature.set(token, Math.max(signature.get(token) ?? 0, weight));
}

export function signatureFor(file: ArchitectureFileFact): Map<string, number> {
  const signature = new Map<string, number>();
  const normalized = normalizeArchitecturePath(file.path);
  addTokens(
    signature,
    path.posix.basename(normalized, path.posix.extname(normalized)),
    6,
  );
  for (const type of file.types) {
    addTokens(signature, type.name, 3);
    for (const member of type.members) {
      addTokens(signature, member.name, 2);
      addTokens(signature, member.kind, 1);
    }
    for (const dependency of type.dependencies)
      addTokens(signature, dependency, 1);
  }
  for (const imported of [...file.imports, ...file.references])
    addTokens(signature, imported, 1);
  return signature;
}

function weight(signature: Map<string, number>, token: string): number {
  return signature.get(token) ?? 0;
}

function pairWeight(input: {
  token: string;
  left: Map<string, number>;
  right: Map<string, number>;
  operator: "min" | "max";
}): number {
  const weights = [
    weight(input.left, input.token),
    weight(input.right, input.token),
  ];
  return input.operator === "min" ? Math.min(...weights) : Math.max(...weights);
}

function weightedTotal(
  left: Map<string, number>,
  right: Map<string, number>,
  operator: "min" | "max",
): number {
  const all = [...new Set([...left.keys(), ...right.keys()])];
  return all.reduce((total, token) => {
    return total + pairWeight({ token, left, right, operator });
  }, 0);
}

export function weightedSimilarity(
  left: Map<string, number>,
  right: Map<string, number>,
): number {
  const union = weightedTotal(left, right, "max");
  const intersection = weightedTotal(left, right, "min");
  return union === 0 ? 0 : intersection / union;
}
