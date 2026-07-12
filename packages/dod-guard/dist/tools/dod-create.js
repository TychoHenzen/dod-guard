/**
 * dod_create — Build a new DoD document with recursive TaskNode tree.
 */
import * as path from "node:path";
import { writeMarkdown } from "../author.js";
import { validateBaseline } from "../baseline.js";
import { computeProofFingerprint, countDraftNodes, flattenConcreteLeaves } from "../checker.js";
import * as store from "../store.js";
import { buildTaskNodes, checkCommandsForOs, extractBaselineSteps, resetNodeIdCounter } from "../tree-utils.js";
export async function handleDodCreate(params) {
    const { title, goal, type, cwd, markdown_path, sections, roots: rootInputs, skip_reasons } = params;
    const resolvedCwd = path.resolve(cwd);
    resetNodeIdCounter();
    const roots = buildTaskNodes(rootInputs);
    // OS validation: concrete leaves only
    const osError = await checkCommandsForOs(roots, resolvedCwd);
    if (osError)
        return osError.content?.[0]?.text ?? "ERROR: OS validation failed.";
    const id = store.generateId();
    const date = new Date().toISOString().split("T")[0];
    const fingerprint = computeProofFingerprint(roots);
    const doc = {
        id,
        title,
        goal,
        date,
        type,
        cwd: resolvedCwd,
        markdown_path: path.resolve(markdown_path),
        created_at: new Date().toISOString(),
        skip_reasons: skip_reasons,
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
    const baseline = validateBaseline(type, extractBaselineSteps(roots), skip_reasons);
    const warningBlock = baseline.errors.length > 0 || baseline.warnings.length > 0
        ? [
            "",
            "⚠️ Baseline advisories:",
            ...baseline.errors.map((e) => `  • ${e} (will be enforced at dod_refine time)`),
            ...baseline.warnings.map((w) => `  • ${w}`),
        ]
        : [];
    return [
        "DoD created.",
        "",
        `ID: ${id}`,
        `Path: ${markdown_path}`,
        `Roots: ${rootCount}`,
        `Concrete proofs: ${concreteCount}`,
        `Draft nodes: ${draftCount}`,
        fingerprint ? `Proof fingerprint: ${fingerprint}` : "",
        ...warningBlock,
        "",
        draftCount > 0
            ? `${draftCount} draft node(s) — refine incrementally per task group with dod_refine, not all at once at the end. Use dod_check(nodePath="0") to verify one subtree at a time.`
            : "All nodes are concrete — dod_check can verify the full DoD.",
        "",
        "NEXT: run `dod_check` to validate proof commands execute on this OS.",
    ]
        .filter(Boolean)
        .join("\n");
}
//# sourceMappingURL=dod-create.js.map