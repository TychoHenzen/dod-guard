/**
 * dod_create — Build a new DoD document with recursive TaskNode tree.
 */
import * as path from "node:path";
import { writeMarkdown } from "../author.js";
import { countDraftNodes } from "../checker.js";
import { computeProofFingerprint, flattenConcreteLeaves } from "../fingerprint.js";
import * as store from "../store.js";
import { buildTaskNodes, checkCommandsForOs, resetNodeIdCounter } from "../tree-utils.js";
import type { DodDocument, DodSections } from "../types.js";

interface CreateParams {
  title: string;
  goal: string;
  type: "bug" | "general" | "minimal";
  cwd: string;
  markdown_path: string;
  sections: DodSections;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  roots: any[];
}

export async function handleDodCreate(params: CreateParams): Promise<string> {
  const { title, goal, type, cwd, markdown_path, sections, roots: rootInputs } = params;

  const resolvedCwd = path.resolve(cwd);
  resetNodeIdCounter();

  const roots = buildTaskNodes(rootInputs);

  // OS validation: concrete leaves only
  const osError = await checkCommandsForOs(roots, resolvedCwd);
  if (osError) return osError;

  const id = store.generateId();
  const date = new Date().toISOString().split("T")[0];

  const fingerprint = computeProofFingerprint(roots);

  const doc: DodDocument = {
    id,
    title,
    goal,
    date,
    type,
    cwd: resolvedCwd,
    markdown_path: path.resolve(markdown_path),
    created_at: new Date().toISOString(),
    execution_confirmed: true,
    sections,
    roots,
    proof_fingerprint: fingerprint || undefined,
    amendments: [],
  };

  await store.save(doc);
  await writeMarkdown(doc);

  const concreteCount = flattenConcreteLeaves(roots).length;
  const draftCount = countDraftNodes(roots);
  const rootCount = roots.length;

  const warnings: string[] = [];

  // Count behavioral predicates for guidance
  const behavioralLeaves = flattenConcreteLeaves(roots).filter((l) => l.node.category === "behavioral");
  if (behavioralLeaves.length === 0 && type !== "minimal") {
    warnings.push("• No behavioral predicate proofs. Every DoD should have at least one");
    warnings.push("  proof that verifies correct behavior (output_contains, output_matches, etc.).");
  }

  return [
    "DoD created.",
    "",
    `ID: ${id}`,
    `Path: ${markdown_path}`,
    `Roots: ${rootCount}`,
    `Concrete proofs: ${concreteCount}`,
    `Draft nodes: ${draftCount}`,
    fingerprint ? `Proof fingerprint: ${fingerprint}` : "",
    warnings.length > 0 ? "" : "",
    ...warnings,
    "",
    draftCount > 0
      ? `${draftCount} draft node(s) — refine with dod_refine. Use dod_check(nodePath="0") for fast scoped iteration.`
      : "All nodes concrete — run dod_check to verify.",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}
