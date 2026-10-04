import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "./index-fixtures.test.js";

test("the MCP server does not advertise the commit decision tool", async () => {
  const connection = await connect();
  try {
    const tools = await connection.client.listTools();
    assert.equal(
      tools.tools.some((tool) => tool.name === "quality_commit_gate"),
      false,
    );
  } finally {
    await connection.close();
  }
});
