import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analysisOptions } from "./repository-analysis.helpers.test.js";
import { analyzeRepositoryCore } from "./repository-analysis.js";
function git(directory, ...arguments_) {
    execFileSync("git", arguments_, { cwd: directory, stdio: "ignore" });
}
function createFixture() {
    const directory = mkdtempSync(join(tmpdir(), "fossil-repository-analysis-"));
    mkdirSync(join(directory, "src"));
    mkdirSync(join(directory, "workspace"));
    mkdirSync(join(directory, "vendor"));
    const tracked = 'import "../workspace/old.js";\nexport const tracked = true;\n';
    const oldWorkspace = "export const retained = true;\n";
    writeFileSync(join(directory, "src", "tracked.ts"), tracked);
    writeFileSync(join(directory, "workspace", "old.js"), oldWorkspace);
    writeFileSync(join(directory, "workspace", "recent.js"), "export const recent = true;\n");
    writeFileSync(join(directory, ".env"), "SECRET=not-inventory\n");
    writeFileSync(join(directory, "vendor", "dependency.js"), "export const dependency = true;\n");
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);
    utimesSync(join(directory, "workspace", "old.js"), old, old);
    git(directory, "init", "-q");
    git(directory, "config", "user.email", "fossil-test@example.invalid");
    git(directory, "config", "user.name", "Fossil Test");
    git(directory, "add", "src/tracked.ts");
    git(directory, "commit", "-qm", "tracked source");
    return { directory, referenceBytes: Buffer.byteLength(tracked) + Buffer.byteLength(oldWorkspace) };
}
test("composes tracked and eligible referenced workspace sources into inventory evidence", async () => {
    const fixture = createFixture();
    try {
        const report = await analyzeRepositoryCore(fixture.directory, analysisOptions);
        assert.equal(report.usage.inventoriedFiles, 2);
        assert.equal(report.usage.referenceBytes, fixture.referenceBytes);
        assert.deepEqual(report.workspaceDebris, []);
        const evidence = JSON.stringify({ warnings: report.warnings, findings: report.workspaceDebris });
        for (const path of ["workspace/recent.js", ".env", "vendor/dependency.js"])
            assert.equal(evidence.includes(path), false);
    }
    finally {
        rmSync(fixture.directory, { recursive: true, force: true });
    }
});
//# sourceMappingURL=repository-analysis.test.js.map