import assert from "node:assert/strict";
import { test } from "node:test";
import { hasInboundWorkspaceUsage, omitUsedWorkspaceCandidates, workspaceDebrisFinding } from "./workspace-debris.js";
test("omits old candidates with resolved imports, exact paths, or a unique basename", () => {
    const candidate = { path: "scratch/old.ts", kind: "untracked", modifiedTimestampMs: 0 };
    const sources = [
        {
            path: "src/importer.ts",
            language: "typescript",
            content: 'import "../scratch/old";\n',
        },
        { path: "scratch/old.ts", language: "typescript", content: 'const own = "old.ts";\n' },
        {
            path: "src/path-user.ts",
            language: "typescript",
            content: 'const source = "scratch/old.ts";\n',
        },
    ];
    const inventory = ["src/importer.ts", "src/path-user.ts", "scratch/old.ts"];
    assert.equal(hasInboundWorkspaceUsage(candidate.path, sources, inventory), true);
    assert.equal(hasInboundWorkspaceUsage(candidate.path, [{ path: "src/path-user.ts", language: "typescript", content: 'const source = "scratch/old.ts";\n' }], ["src/path-user.ts", "scratch/old.ts", "other/old.ts"]), true);
    assert.equal(hasInboundWorkspaceUsage("scratch/unique.ts", [{ path: "src/user.ts", language: "typescript", content: 'const source = "unique.ts";\n' }], ["src/user.ts", "scratch/unique.ts"]), true);
    assert.deepEqual(omitUsedWorkspaceCandidates([candidate], sources, inventory), []);
    assert.equal(workspaceDebrisFinding(candidate, sources, inventory, "C:/repo", []), undefined);
});
//# sourceMappingURL=workspace-usage.cases.js.map