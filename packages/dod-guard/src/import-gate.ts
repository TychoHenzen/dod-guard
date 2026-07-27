import { flattenConcreteLeaves } from "./fingerprint.js";
import type { DodDocument } from "./types.js";

export type ImportGateInfo =
  | {
      blocked: true;
      executableCount: number;
      commandList: { title: string; command: string; description: string }[];
    }
  | { blocked: false };

/**
 * Check whether an imported DoD needs human confirmation before execution.
 * Returns a gate info object when the doc is imported and unconfirmed,
 * or { blocked: false } when execution can proceed freely.
 */
export function buildImportGateInfo(doc: DodDocument): ImportGateInfo {
  if (!doc.import_source || doc.execution_confirmed !== false) {
    return { blocked: false };
  }

  const executableLeaves = flattenConcreteLeaves(doc.roots).filter(({ node }) => node.command && node.predicate);

  return {
    blocked: true,
    executableCount: executableLeaves.length,
    commandList: executableLeaves.map(({ node }) => ({
      title: node.title,
      command: node.command ?? "",
      description: node.description ?? "",
    })),
  };
}
