import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import {
  connectLegacy,
  removeFixture,
  resultText,
  stagedFixture,
} from "./index-fixtures.test.js";

const MISSING_ROOT = /repository root does not exist/;
const REFACTOR_TARGET = /requires --target/;

test("legacy registration remains internal and keeps wrappers exercised", async () => {
  const root = stagedFixture();
  const connection = await connectLegacy();
  try {
    await assertLegacyToolsAvailable(connection);
    await assertLegacyGate(connection, root);
    await assertLegacySkips(connection, root);
    await assertLegacyCommitGate(connection, root);
  } finally {
    await connection.close();
    removeFixture(root);
  }
});

async function assertLegacyToolsAvailable(
  connection: Awaited<ReturnType<typeof connectLegacy>>,
) {
  const tools = await connection.client.listTools();
  for (const name of ["quality_gate", "quality_skips", "quality_commit_gate"]) {
    assert.equal(
      tools.tools.some((tool) => tool.name === name),
      true,
    );
  }
}

async function assertLegacyGate(
  connection: Awaited<ReturnType<typeof connectLegacy>>,
  root: string,
) {
  const gate = await connection.client.callTool({
    name: "quality_gate",
    arguments: {
      baseline: ".github/quality/quality-baseline.json",
      paths: ["."],
      root,
    },
  });
  assert.equal(gate.isError, undefined);

  const invalidGate = await connection.client.callTool({
    name: "quality_gate",
    arguments: {
      baseline: ".github/quality/quality-baseline.json",
      paths: ["."],
      root: join(root, "missing"),
    },
  });
  assert.match(resultText(invalidGate), MISSING_ROOT);
}

async function assertLegacySkips(
  connection: Awaited<ReturnType<typeof connectLegacy>>,
  root: string,
) {
  const skips = await connection.client.callTool({
    name: "quality_skips",
    arguments: { root },
  });
  assert.equal(resultText(skips), "No unacknowledged quality-gate waivers.");

  const invalidSkips = await connection.client.callTool({
    name: "quality_skips",
    arguments: { root: join(root, "missing") },
  });
  assert.match(resultText(invalidSkips), MISSING_ROOT);
}

async function assertLegacyCommitGate(
  connection: Awaited<ReturnType<typeof connectLegacy>>,
  root: string,
) {
  const usage = await connection.client.callTool({
    name: "quality_commit_gate",
    arguments: { intent: "refactor", root },
  });
  assert.match(resultText(usage), REFACTOR_TARGET);

  const decision = await connection.client.callTool({
    name: "quality_commit_gate",
    arguments: { root },
  });
  assert.equal(decision.isError, undefined);

  const invalidDecision = await connection.client.callTool({
    name: "quality_commit_gate",
    arguments: { root: join(root, "missing") },
  });
  assert.match(resultText(invalidDecision), MISSING_ROOT);
}
