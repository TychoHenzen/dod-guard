import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { discoverGitRepository } from "./git-process.js";
const testName = "uses the default Git process";
test(`${testName} when no spawn override is supplied`, async () => {
    const child = discoverGitRepository(process.cwd());
    const [exitCode] = await once(child, "close");
    assert.equal(exitCode, 0);
});
//# sourceMappingURL=git-process-discovery-default.test.js.map