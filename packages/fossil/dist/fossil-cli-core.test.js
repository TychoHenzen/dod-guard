import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
test("prints the public analyze command in CLI help", () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./fossil-cli-core.js", import.meta.url)), "--help"], {
        encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /analyze \[options\] \[repo-path\]/);
});
//# sourceMappingURL=fossil-cli-core.test.js.map