import assert from "node:assert/strict";
import { test } from "node:test";
import { runStagedCheck } from "./commit-gate/cli.js";
import {
  connect,
  removeFixture,
  resultText,
  stagedFixture,
} from "./index-fixtures.test.js";

test("the MCP commit-gate tool returns the staged decision JSON", async () => {
  const root = stagedFixture();
  const connection = await connect();
  try {
    const result = await connection.client.callTool({
      name: "quality_commit_gate",
      arguments: { root },
    });
    const decision = JSON.parse(resultText(result));
    const cli = runStagedCheck(root, { json: true, intent: "change" });
    assert.match(decision.verdict, /^(PASS|REVIEW_REQUIRED|FAIL)$/);
    assert.equal(typeof decision.fingerprint, "string");
    assert.equal(Array.isArray(decision.findings), true);
    assert.equal(decision.verdict, cli.verdict);
    assert.equal(decision.fingerprint, cli.fingerprint);
    assert.deepEqual(
      decision.findings.map((finding: { id: string }) => finding.id),
      cli.findings.map((finding) => finding.id),
    );
  } finally {
    await connection.close();
    removeFixture(root);
  }
});

test("commit-gate tool reports concise refactor usage", async () => {
  const connection = await connect();
  try {
    const result = await connection.client.callTool({
      name: "quality_commit_gate",
      arguments: { root: process.cwd(), intent: "refactor" },
    });
    const output = resultText(result);
    assert.match(output, /^ERROR: .*requires.*target/i);
    assert.equal(output.includes("at "), false);
  } finally {
    await connection.close();
  }
});
