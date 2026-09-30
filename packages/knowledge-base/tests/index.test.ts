import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { defaultKnowledgeBaseDir } from "../src/index.js";

const environmentName = "DOD_GUARD_KNOWLEDGE_BASE_DIR";

function restoreEnvironment(value: string | undefined): void {
  if (value === undefined) {
    delete process.env[environmentName];
  } else {
    process.env[environmentName] = value;
  }
}

test("uses the Obsidian vault when the knowledge-base root is unset", () => {
  const previous = process.env[environmentName];
  try {
    delete process.env[environmentName];
    assert.equal(defaultKnowledgeBaseDir(), "C:\\Obsidian\\Knowledgebase");
  } finally {
    restoreEnvironment(previous);
  }
  assert.equal(process.env[environmentName], previous);
});

test("uses and restores the configured knowledge-base root override", () => {
  const previous = process.env[environmentName];
  const override = "C:\\Temp\\knowledge-base-test";
  try {
    process.env[environmentName] = override;
    assert.equal(defaultKnowledgeBaseDir(), override);
  } finally {
    restoreEnvironment(previous);
  }
  assert.equal(process.env[environmentName], previous);
});
