// Proves the quality_test_quality MCP tool reports findings on the shared
// severity scale.
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fixture, withClient } from "./http-test-support.js";
import { evidenceWithSignals } from "./test-quality-fixtures.js";

test("quality_test_quality returns only medium findings", async () => {
  const root = fixture("signals");
  try {
    mkdirSync(join(root, ".quality"));
    writeFileSync(
      join(root, ".quality", "signals.json"),
      JSON.stringify(evidenceWithSignals()),
    );
    const result = await withClient((client) =>
      client.callTool({
        name: "quality_test_quality",
        arguments: { root, evidence: ".quality/signals.json" },
      }),
    );
    assert.equal(result.isError, undefined);
    const content = result.content as Array<{ text: string }>;
    const report = JSON.parse(content[0].text) as {
      status: string;
      findings: Array<{ severity: string }>;
    };
    assert.equal(report.status, "ok");
    assert.ok(report.findings.length > 0);
    assert.deepEqual(
      [...new Set(report.findings.map((finding) => finding.severity))],
      ["medium"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
