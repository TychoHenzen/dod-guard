/**
 * Shared adapter helpers: document resolution, legacy-format detection,
 * and the text/error wrapping every tool handler uses.
 */
import * as store from "../store.js";
import type { DodDocument } from "../types.js";

export function text(value: string): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: value }] };
}

function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.startsWith("ERROR:") ? msg : `ERROR: ${msg}`;
}

/** Run a handler and wrap its result (or thrown error) as MCP text content. */
export async function run(handler: () => Promise<string>): Promise<ReturnType<typeof text>> {
  try {
    return text(await handler());
  } catch (err) {
    return text(errorText(err));
  }
}

/** Resolve a document by dod_id or markdown path. Returns an ERROR: string on failure. */
export async function resolveDoc(dodId?: string, mdPath?: string): Promise<DodDocument | string> {
  if (!dodId && !mdPath) {
    return "ERROR: no dod_id or path given, DoD not found.";
  }
  const doc = dodId ? await store.load(dodId) : await store.findByPath(mdPath as string);
  if (!doc) {
    return dodId ? `ERROR: DoD "${dodId}" not found.` : `ERROR: no DoD registered for path "${mdPath}", not found.`;
  }
  return doc;
}

export function isDocError(value: DodDocument | string): value is string {
  return typeof value === "string";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawDoc = Record<string, any>;

/** True when a raw stored document is still in the pre-TaskNode 'steps' format. */
export function isLegacyFormat(raw: RawDoc): boolean {
  const hasSteps = Array.isArray(raw.steps) && raw.steps.length > 0;
  const hasRoots = Array.isArray(raw.roots) && raw.roots.length > 0;
  return hasSteps && !hasRoots;
}
