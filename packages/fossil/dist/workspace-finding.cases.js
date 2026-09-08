import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceDebrisFinding } from "./workspace-debris.js";
test("reports an unreferenced old candidate as separate workspace debris", () => {
    const finding = workspaceDebrisFinding({
        candidate: {
            path: "scratch/old.ts",
            kind: "untracked",
            modifiedTimestampMs: 0,
        },
        sources: [
            {
                path: "src/live.ts",
                language: "typescript",
                content: "export const live = true;\n",
            },
        ],
        inventoryPaths: ["src/live.ts", "scratch/old.ts"],
        analysisBoundary: "C:/repo",
        unobservedMechanisms: ["dynamic runtime loading"],
    });
    assert.deepEqual(finding, {
        classification: "advisory",
        review: "possible workspace debris",
        path: "scratch/old.ts",
        kind: "untracked",
        modifiedTimestampMs: 0,
        ageSource: "mtime",
        ageUncertainty: "Modification time is filesystem metadata. " +
            "Copying, restoring, extracting, or rebuilding can change it.",
        ignore: undefined,
        detectedReferenceEvidence: [],
        analysisBoundary: "C:/repo",
        unobservedReferenceMechanisms: ["dynamic runtime loading"],
    });
});
test("labels a high-confidence-looking debris candidate for review with mtime " +
    "uncertainty", () => {
    const finding = workspaceDebrisFinding({
        candidate: {
            path: "scratch/very-old.ts",
            kind: "untracked",
            modifiedTimestampMs: 0,
        },
        sources: [],
        inventoryPaths: ["scratch/very-old.ts"],
        analysisBoundary: "C:/repo",
        unobservedMechanisms: ["runtime reflection"],
    });
    assert.ok(finding);
    assert.equal(finding.classification, "advisory");
    assert.equal(finding.review, "possible workspace debris");
    assert.equal(finding.ageSource, "mtime");
    assert.equal(finding.ageUncertainty.includes("Copying, restoring, extracting, or rebuilding can change it."), true);
    assert.deepEqual(finding.unobservedReferenceMechanisms, [
        "runtime reflection",
    ]);
    assert.equal(JSON.stringify(finding).toLowerCase().includes("delete"), false);
});
//# sourceMappingURL=workspace-finding.cases.js.map