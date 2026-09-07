import type { LandmarkCandidate } from "./landmark-candidate.js";
import {
  type LandmarkGroupName,
  landmarkGroupNames,
} from "./landmark-group-name.js";

const messageOrEventSuffixes = [
  "event",
  "message",
  "command",
  "request",
  "response",
];
const serviceSuffixes = [
  "service",
  "manager",
  "controller",
  "repository",
  "provider",
  "client",
];
const typeKinds = new Set([
  "class",
  "enum",
  "interface",
  "record",
  "struct",
  "type",
]);
const callableKinds = new Set(["constructor", "function", "method"]);

export function landmarkGroupFor(
  candidate: LandmarkCandidate,
): LandmarkGroupName | undefined {
  const name = candidate.symbol.name.normalize("NFKC").toLocaleLowerCase();
  const kind = candidate.symbol.kind.normalize("NFKC").toLocaleLowerCase();
  if (typeKinds.has(kind)) return typeGroup(name);
  if (callableKinds.has(kind)) return callableGroup(candidate, name);
  return;
}

function typeGroup(name: string): LandmarkGroupName {
  if (messageOrEventSuffixes.some((suffix) => name.endsWith(suffix)))
    return "messages_or_events";
  if (serviceSuffixes.some((suffix) => name.endsWith(suffix)))
    return "services";
  return "types";
}

function callableGroup(
  candidate: LandmarkCandidate,
  name: string,
): LandmarkGroupName {
  return candidate.entry_point === true || name === "main"
    ? "entry_points"
    : "common_actions";
}

export function landmarkGroupIndex(candidate: LandmarkCandidate): number {
  return landmarkGroupNames.indexOf(
    landmarkGroupFor(candidate) ?? "common_actions",
  );
}
