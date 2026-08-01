/**
 * Prompt context for the solve fanout.
 *
 * The base layers describe the goal and the files the worker may touch. A
 * repair adds summaries of the earlier tries and the failure signatures seen
 * so far, so the worker never repeats an approach that already failed.
 */

import {
  type AttemptSummary,
  assembleContext,
  type ContextLayers,
  type CuratedContext,
  type FailureSignature,
  generateFactSheet,
  makeTargetFiles,
  type TargetFileContent,
} from "./context.js";
import { readAllowedFiles } from "./solve-files.js";
import type { TaskSpec } from "./types.js";

/** Characters of a prior failure kept as the signature description. */
const DESCRIPTION_CHARS = 200;

/** Built once per spec: the layers cost a file scan and a fact-sheet read. */
const LAYER_CACHE = new WeakMap<TaskSpec, ContextLayers>();

/** The goal, with the caller extra context appended when present. */
export function goalWithContext(spec: TaskSpec): string {
  if (!spec.context) return spec.goal;
  return `${spec.goal}\n\nAdditional context: ${spec.context}`;
}

function buildLayers(spec: TaskSpec): ContextLayers {
  const factSheet = generateFactSheet(spec.cwd);
  const targets: TargetFileContent[] = makeTargetFiles(readAllowedFiles(spec.cwd, spec.allowed_files));
  return {
    goal: goalWithContext(spec),
    targetFiles: targets,
    constraints: factSheet ? { lintRules: "", conventions: factSheet, typeConfig: "" } : undefined,
  };
}

function baseLayers(spec: TaskSpec): ContextLayers {
  const cached = LAYER_CACHE.get(spec);
  if (cached) return cached;
  const layers = buildLayers(spec);
  LAYER_CACHE.set(spec, layers);
  return layers;
}

/** Context for the first try of every plan. */
export function baseContext(spec: TaskSpec): CuratedContext {
  return assembleContext(baseLayers(spec));
}

function signaturesOf(attempts: AttemptSummary[]): FailureSignature[] {
  const found: FailureSignature[] = [];
  for (const attempt of attempts) {
    if (!attempt.failureSignature) continue;
    found.push({
      hash: attempt.failureSignature,
      description: attempt.summary.slice(0, DESCRIPTION_CHARS),
      count: 1,
    });
  }
  return found;
}

/** Context for a repair try: the base layers plus what came before. */
export function repairContext(spec: TaskSpec, attempts: AttemptSummary[]): CuratedContext {
  const signatures = signaturesOf(attempts);
  return assembleContext({
    ...baseLayers(spec),
    priorAttempts: attempts.length > 0 ? attempts : undefined,
    failureSignatures: signatures.length > 0 ? signatures : undefined,
  });
}
