import assert from "node:assert/strict";
import { test } from "node:test";
import { runFossilCli } from "./index.js";
import { optionsFor } from "./index.test-support.js";
import { BURST_FIXTURE } from "./output-burst-fixture.js";
import { createReport } from "./testing/report-fixtures.js";
async function runTableCli(isTty) {
    const stdout = [];
    await runFossilCli(["node", "fossil", "analyze", "C:/repositories/table", "--format", "table"], {
        analyze: async () => createReport(optionsFor("table"), { bursts: [BURST_FIXTURE] }),
        isTty: () => isTty,
        stdout: (message) => stdout.push(message),
    });
    return stdout.join("");
}
test("uses the injected TTY capability for table styling", async () => {
    const redirected = await runTableCli(false);
    const terminal = await runTableCli(true);
    assert.equal(redirected.includes("\u001b["), false);
    assert.equal(terminal.includes("\u001b["), true);
});
//# sourceMappingURL=index-api-tty.cases.js.map