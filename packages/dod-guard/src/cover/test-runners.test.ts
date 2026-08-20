import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { loadTestRunnerConfig } from "./test-runners.js";

async function withTempWorkspace(run: (workspace: string) => Promise<void>): Promise<void> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-test-runners-"));
  try {
    await run(workspace);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

async function writeConfig(workspace: string, content: string): Promise<void> {
  const openspec = path.join(workspace, "openspec");
  await fs.mkdir(openspec, { recursive: true });
  await fs.writeFile(path.join(openspec, "test-runners.json"), content);
}

test("loadTestRunnerConfig returns an empty config when the file is absent", async () => {
  await withTempWorkspace(async (workspace) => {
    assert.deepEqual(await loadTestRunnerConfig(workspace), { config: {} });
  });
});

test("loadTestRunnerConfig returns a valid language-keyed config", async () => {
  await withTempWorkspace(async (workspace) => {
    await writeConfig(workspace, JSON.stringify({ typescript: "npm test", python: "pytest" }));
    assert.deepEqual(await loadTestRunnerConfig(workspace), {
      config: { typescript: "npm test", python: "pytest" },
    });
  });
});

test("loadTestRunnerConfig reports invalid JSON", async () => {
  await withTempWorkspace(async (workspace) => {
    await writeConfig(workspace, "{not-json");
    assert.deepEqual(await loadTestRunnerConfig(workspace), {
      unresolvedReason: "openspec/test-runners.json contains invalid JSON",
    });
  });
});

test("loadTestRunnerConfig reports non-object JSON", async () => {
  await withTempWorkspace(async (workspace) => {
    await writeConfig(workspace, JSON.stringify(["pytest"]));
    assert.deepEqual(await loadTestRunnerConfig(workspace), {
      unresolvedReason: "openspec/test-runners.json must contain a JSON object keyed by language",
    });
  });
});

test("loadTestRunnerConfig propagates errors other than a missing file", async () => {
  await withTempWorkspace(async (workspace) => {
    const openspec = path.join(workspace, "openspec");
    await fs.mkdir(openspec, { recursive: true });
    await fs.mkdir(path.join(openspec, "test-runners.json"));
    await assert.rejects(() => loadTestRunnerConfig(workspace), { code: "EISDIR" });
  });
});
