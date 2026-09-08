import assert from "node:assert/strict";
import { test } from "node:test";
import { renderBurstTableRows } from "./output.js";
import { findingExplanation } from "./output.test-support.js";
test("renders ANSI styling only when the caller marks table output as a TTY", () => {
    const rows = [
        {
            kind: "burst",
            id: "burst-1",
            startDate: "2025-01-01",
            endDate: "2025-01-02",
            commitCount: 2,
            fileCount: 1,
        },
        { kind: "survivor", path: "src/survivor.ts" },
        { kind: "finding", path: "src/finding.ts", score: 0.8, scoreBasis: "full" },
        findingExplanation("src/candidate.ts", "src/live.ts"),
    ];
    const redirected = renderBurstTableRows(rows, { isTty: false });
    const tty = renderBurstTableRows(rows, { isTty: true });
    assert.equal(redirected.includes("\u001b["), false);
    assert.match(redirected, /Burst burst-1/);
    assert.match(redirected, /survivor src\/survivor.ts/);
    assert.match(redirected, /finding src\/finding.ts: score 0.8 \(full\)/);
    assert.match(redirected, /created in burst; 2 burst commits, 0 post-burst commits/);
    assert.equal(tty.startsWith("\u001b[1mBurst burst-1"), true);
});
test("escapes control characters from repository-derived table text", () => {
    const rows = [
        {
            kind: "burst",
            id: "burst\u001b[31m\u000a\u0085",
            startDate: "2025-01-01",
            endDate: "2025-01-02",
            commitCount: 2,
            fileCount: 1,
        },
        { kind: "survivor", path: "src/\u0007survivor.ts" },
        { kind: "finding", path: "src/\u001b[2Jfinding.ts", score: 0.8, scoreBasis: "full" },
        findingExplanation("src/candidate\u001b.ts", "src/live\u0085.ts"),
    ];
    const redirected = renderBurstTableRows(rows, { isTty: false });
    const tty = renderBurstTableRows(rows, { isTty: true });
    const hasTerminalControl = (value) => [...value].some((character) => {
        const codePoint = character.codePointAt(0) ?? -1;
        return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    });
    assert.equal(redirected.split("\n").some(hasTerminalControl), false);
    assert.equal(redirected.includes("burst\\u001b[31m\\u000a\\u0085"), true);
    assert.equal(redirected.includes("src/\\u0007survivor.ts"), true);
    assert.equal(redirected.includes("src/\\u001b[2Jfinding.ts"), true);
    assert.equal(tty.replaceAll("\u001b[1m", "").replaceAll("\u001b[0m", "").split("\n").some(hasTerminalControl), false);
    assert.equal(tty.startsWith("\u001b[1mBurst burst\\u001b[31m\\u000a\\u0085"), true);
});
//# sourceMappingURL=output-ansi.cases.js.map