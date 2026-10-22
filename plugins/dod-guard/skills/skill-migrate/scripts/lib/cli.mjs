import { readFileSync } from "node:fs";
import { KINDS } from "./kind-tables.mjs";
import { detectKind } from "./kinds.mjs";
import { runChecks } from "./run-checks.mjs";
import { overallScore } from "./scoring.mjs";

const FLAG_RE = /^--([\w-]+)(?:=(.*))?$/;

export function parseArgs(argv) {
  const args = { positional: [] };
  for (const item of argv) {
    const match = FLAG_RE.exec(item);
    if (!match) {
      args.positional.push(item);
      continue;
    }
    args[match[1]] = match[2] ?? "true";
  }
  return args;
}

export function resolveKind(args, target, text) {
  if (!args.kind) return detectKind(target, text);
  if (!Object.hasOwn(KINDS, args.kind)) return null;
  return args.kind;
}

function readTarget(target) {
  try {
    return { text: readFileSync(target, "utf8") };
  } catch (err) {
    return { error: `Cannot read ${target}: ${err.message}\n` };
  }
}

const unknownKindMessage = (kind) => `Unknown --kind: ${kind}. Expected one of: ${Object.keys(KINDS).join(", ")}\n`;

export function loadRun(args, target) {
  const source = readTarget(target);
  if (source.error) return { error: source.error };
  const kind = resolveKind(args, target, source.text);
  if (!kind) return { error: unknownKindMessage(args.kind) };
  const checks = runChecks(source.text, kind);
  return { run: { checks, score: overallScore(checks), kind } };
}
