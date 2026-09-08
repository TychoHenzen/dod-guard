import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeReferences } from "./ref-analyzer.js";
import { edgeSummary } from "./ref-analyzer.test-support.js";
test("resolves sibling, module-directory, and nearest-Cargo-root Rust modules", () => {
    const graph = analyzeReferences([
        {
            path: "workspace/app/src/main.rs",
            language: "rust",
            content: "mod sibling;\nmod folder;\nmod missing;\nuse crate::models::user;\n",
        },
        { path: "workspace/app/src/sibling.rs", language: "rust", content: "" },
        { path: "workspace/app/src/folder/mod.rs", language: "rust", content: "" },
        { path: "workspace/app/src/models/user.rs", language: "rust", content: "" },
        {
            path: "workspace/app/tools/nested/src/main.rs",
            language: "rust",
            content: "use crate::models::user;\n",
        },
        { path: "workspace/app/tools/nested/src/models/user/mod.rs", language: "rust", content: "" },
    ]);
    assert.deepEqual(edgeSummary(graph), [
        {
            sourcePath: "workspace/app/src/main.rs",
            targetPath: "workspace/app/src/sibling.rs",
            language: "rust",
            kind: "rust-mod",
            strength: "strong",
        },
        {
            sourcePath: "workspace/app/src/main.rs",
            targetPath: "workspace/app/src/folder/mod.rs",
            language: "rust",
            kind: "rust-mod",
            strength: "strong",
        },
        {
            sourcePath: "workspace/app/src/main.rs",
            targetPath: "workspace/app/src/models/user.rs",
            language: "rust",
            kind: "rust-use",
            strength: "strong",
        },
        {
            sourcePath: "workspace/app/tools/nested/src/main.rs",
            targetPath: "workspace/app/tools/nested/src/models/user/mod.rs",
            language: "rust",
            kind: "rust-use",
            strength: "strong",
        },
    ]);
    assert.deepEqual(graph.unresolved.map(({ sourcePath, targetCandidates, kind, resolution }) => ({
        sourcePath,
        targetCandidates,
        kind,
        resolution,
    })), [
        {
            sourcePath: "workspace/app/src/main.rs",
            targetCandidates: ["workspace/app/src/missing.rs", "workspace/app/src/missing/mod.rs"],
            kind: "rust-mod",
            resolution: "unresolved",
        },
    ]);
});
//# sourceMappingURL=ref-parsers-rust.cases.js.map