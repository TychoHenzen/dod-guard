import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import {
  connect,
  connectLegacy,
  removeFixture,
  resultText,
  stagedFixture,
} from "./index-fixtures.test.js";

const MISSING_ROOT = /repository root does not exist/;

test("MCP server lists advisory quality tools only", async () => {
  const connection = await connect();
  try {
    const tools = await connection.client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "quality_report",
      "quality_scan",
      "quality_test_quality",
    ]);
    assert.equal(
      tools.tools.every((tool) => Boolean(tool.description)),
      true,
    );
  } finally {
    await connection.close();
  }
});

test("legacy registration keeps baseline and waiver wrappers internal", async () => {
  const root = stagedFixture();
  const connection = await connectLegacy();
  const call = (name: string, arguments_: Record<string, unknown>) =>
    connection.client.callTool({ name, arguments: arguments_ });
  const missingRoot = join(root, "missing");
  try {
    const tools = await connection.client.listTools();
    assert.equal(
      tools.tools.some((tool) => tool.name === "quality_commit_gate"),
      false,
    );
    await assertLegacyReadTools(call, root, missingRoot);
  } finally {
    await connection.close();
    removeFixture(root);
  }
});

async function assertLegacyReadTools(
  call: (name: string, arguments_: Record<string, unknown>) => Promise<unknown>,
  root: string,
  missingRoot: string,
) {
  const gate = await call("quality_gate", {
    baseline: ".github/quality/quality-baseline.json",
    paths: ["."],
    root,
  });
  assert.equal((gate as { isError?: boolean }).isError, undefined);
  assert.match(
    resultText(
      await call("quality_gate", {
        baseline: ".github/quality/quality-baseline.json",
        paths: ["."],
        root: missingRoot,
      }),
    ),
    MISSING_ROOT,
  );
  assert.equal(
    resultText(await call("quality_skips", { root })),
    "No unacknowledged quality-gate waivers.",
  );
  assert.match(
    resultText(await call("quality_skips", { root: missingRoot })),
    MISSING_ROOT,
  );
}
