/**
 * dod_refine — Refine a draft TaskNode into concrete or subdivide into children.
 */
import { writeMarkdown } from "../author.js";
import { baselineLockError } from "../baseline.js";
import { computeProofFingerprint, countDraftNodes, findNodeByPath, isExecutablePredicate } from "../checker.js";
import { findMissingTools, isPlaceholderCommand } from "../command-check.js";
import * as store from "../store.js";
import { extractBaselineSteps, formatMissingTools } from "../tree-utils.js";
export async function handleDodRefine(params) {
    const { dod_id, node_path: nodePath, mode, command, predicate, description, category, advisory, children } = params;
    const doc = await store.load(dod_id);
    if (!doc)
        return "ERROR: DoD not found.";
    const node = findNodeByPath(doc.roots, nodePath);
    if (!node)
        return `ERROR: node not found at path "${nodePath}".`;
    if (node.refinement !== "draft")
        return `ERROR: node "${node.title}" is already concrete. Use dod_amend to modify.`;
    if (node.children && node.children.length > 0)
        return `ERROR: node "${node.title}" is a task group with children — not a leaf. Refine its children instead.`;
    const oldIntent = node.intent;
    // Collect placeholder warnings (function-scoped so msg construction can reference them)
    let placeholderWarn = [];
    if (mode === "concretize") {
        if (!(command && predicate)) {
            return "ERROR: concretize mode requires command and predicate.";
        }
        const pred = predicate;
        if (isExecutablePredicate(pred.type) && command.trim() !== "") {
            const missing = await findMissingTools([command], doc.cwd);
            if (missing.length > 0) {
                return formatMissingTools(missing);
            }
        }
        node.refinement = "concrete";
        node.command = command;
        node.predicate = pred;
        node.description = description ?? "";
        if (category)
            node.category = category;
        if (advisory !== undefined)
            node.advisory = advisory;
        else if (pred.type === "regression")
            node.advisory = true;
        // Coverage metrics default to higher-is-better
        if (pred.type === "regression" && node.category === "coverage" && pred.lower_is_better === undefined) {
            node.predicate.lower_is_better = false;
        }
        node.intent = undefined;
        node.last_status = "pending";
        doc.amendments.push({
            timestamp: new Date().toISOString(),
            node_path: nodePath,
            action: "refined",
            old_value: { refinement: "draft", intent: oldIntent },
            new_value: { refinement: "concrete", command, predicate: { ...pred }, description: description ?? "" },
            reason: `Refined draft → concrete: ${description ?? ""}`,
        });
        // Detect placeholder proofs that always pass (no real verification)
        placeholderWarn = isPlaceholderCommand(command ?? "")
            ? [
                "",
                "⚠️  PLACEHOLDER PROOF: This command always exits 0 — it provides zero verification.",
                "The proof will pass dod_check regardless of whether the code actually works.",
                "Replace with a real verification command before considering this DoD complete.",
                "Examples: actual test run, linter check, build verification, grep for expected output.",
            ]
            : [];
    }
    else {
        // subdivide mode
        if (!children || children.length === 0) {
            return "ERROR: subdivide mode requires at least one child in children array.";
        }
        const childNodes = children.map((c) => {
            const childId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${Math.random().toString(36).slice(2, 4)}`;
            return {
                id: childId,
                title: c.title,
                refinement: "draft",
                intent: c.intent,
                last_status: "draft",
            };
        });
        // Convert draft leaf → task group with children
        node.children = childNodes;
        node.refinement = "concrete"; // Task groups are always concrete
        node.intent = undefined;
        // Clear leaf-only fields that shouldn't exist on a task group
        delete node.command;
        delete node.predicate;
        delete node.description;
        delete node.category;
        doc.amendments.push({
            timestamp: new Date().toISOString(),
            node_path: nodePath,
            action: "refined",
            old_value: { refinement: "draft", intent: oldIntent },
            new_value: { refinement: "concrete", children: childNodes },
            reason: `Subdivided into ${children.length} child draft nodes`,
        });
    }
    const draftCount = countDraftNodes(doc.roots);
    // Lock gate: concretizing the last draft "locks" the DoD (no drafts remain).
    // A locked DoD must satisfy the company baseline — reject before persisting so
    // the tree stays in its pre-refine state and the author can add the missing proof.
    if (mode === "concretize" && draftCount === 0) {
        const lockErr = baselineLockError(doc.type ?? "general", extractBaselineSteps(doc.roots), doc.skip_reasons);
        if (lockErr)
            return lockErr;
    }
    doc.proof_fingerprint = computeProofFingerprint(doc.roots) || undefined;
    await store.save(doc);
    await writeMarkdown(doc);
    const msg = mode === "concretize"
        ? [
            `Node refined: "${node.title}" is now concrete.`,
            `Command: \`${command}\``,
            `Predicate: ${predicate.type}:${predicate.value ?? "(no value)"}`,
            `Description: ${description}`,
            ...placeholderWarn,
            draftCount === 0
                ? "\n🎉 All nodes are now concrete — the DoD is fully verifiable. Run dod_check."
                : `\n${draftCount} draft node(s) remaining.`,
        ].join("\n")
        : [
            `Node subdivided: "${node.title}" is now a task group with ${children?.length} child draft(s).`,
            `Children: ${children?.map((c) => `"${c.title}"`).join(", ")}`,
            `\n${draftCount} draft node(s) total. Refine each draft leaf before running dod_check.`,
        ].join("\n");
    return msg;
}
//# sourceMappingURL=dod-refine.js.map