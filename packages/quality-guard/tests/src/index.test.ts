import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "./index-fixtures.test.js";

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
