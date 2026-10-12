import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { it } from "node:test";
import { createLanguageAdapter } from "../../src/semantic/adapters/language-adapter-factory.js";
import { createRustAdapter } from "../../src/semantic/adapters/language-adapter.js";
import { spawnNativeLspProcess } from "../../src/semantic/adapters/native-lsp-process.js";
import { configuredCapabilities } from "../../src/semantic/adapters/language-adapter-status.js";
import type { SemanticResult } from "../../src/semantic/contracts/contract.js";
import { createNativeProjectRoot } from "../../src/semantic/project-root/project-root.js";
import { createLazyRuntimeAdapter } from "../../src/semantic/runtime/runtime-lazy-adapter.js";
import { createFilteredWorkspace } from "../../src/semantic/workspace/filtered-workspace.js";
import { ownedResources } from "../../src/semantic/workspace/owned-resources.js";
import { createStdioCloseController } from "../../src/stdio-lifecycle.js";
import {
  removeTemporaryTree,
  waitForPidExit,
  waitForPidFile,
  writeFakeLspServer,
} from "../testing/index/index-test-fake-backend.js";

const capabilities = configuredCapabilities(undefined);
const searchResult: SemanticResult = {
  operation: "search",
  revision: { generation: 0, manifest_sha256: "fixture" },
  symbols: [],
};

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (value) => settle?.(value) };
}

function pending(): Promise<void> {
  return new Promise<void>(() => undefined);
}

function recordingCloser() {
  const exits: number[] = [];
  const errors: string[] = [];
  const closer = createStdioCloseController({
    closeCore: async () => undefined,
    releaseResources: () => ownedResources.seal(),
    exit: (code) => {
      exits.push(code);
    },
    writeError: (line) => {
      errors.push(line);
    },
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  });
  return { closer, exits, errors };
}

async function waitForExit(exits: number[], budgetMs: number): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (exits.length === 0 && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 20));
}

it("shutdown during the presence check prevents build", async () => {
  const presence = deferred<boolean>();
  let builds = 0;
  const adapter = createLazyRuntimeAdapter({
    language: "rust",
    backendName: "rust-analyzer",
    capabilities,
    isPresent: () => presence.promise,
    build: () => {
      builds += 1;
      return createLanguageAdapter("rust", {
        backend: {
          readiness: () => ({ state: "ready" }),
          query: async () => searchResult,
        },
        compatible: true,
        backend_version: "fake",
      });
    },
  });
  const starting = adapter.start?.() ?? Promise.resolve();
  const stopping = adapter.shutdown?.();
  presence.resolve(true);
  await assert.rejects(starting, /backend_unavailable/);
  await stopping;
  assert.equal(builds, 0);
});

// Seals the process-wide registry, so this test must stay last in the file.
it("stdio close during an in-flight start leaves no process and no root", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "code-explorer-lazy-close-"));
  const project = join(temporary, "project");
  const fake = join(temporary, "fake-lsp.mjs");
  const pidFile = join(temporary, "fake.pid");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "src", "main.rs"), "fn main() {}\n", "utf8");
  writeFakeLspServer(fake);
  const source = createNativeProjectRoot(project);
  const serviceRoots: string[] = [];
  const adapter = createLazyRuntimeAdapter({
    language: "rust",
    backendName: "rust-analyzer",
    capabilities,
    isPresent: async () => true,
    build: () => {
      const filtered = createFilteredWorkspace(source);
      serviceRoots.push(dirname(filtered.root.canonicalPath));
      spawnNativeLspProcess(process.execPath, [fake], {
        SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot ?? "",
        CODE_EXPLORER_FAKE_KEEPALIVE: "1",
        CODE_EXPLORER_FAKE_PID_FILE: pidFile,
      });
      return createRustAdapter({
        backend: {
          readiness: () => ({ state: "initializing" }),
          query: async () => searchResult,
          start: pending,
        },
        compatible: true,
        backend_version: "fake",
      });
    },
  });
  try {
    void adapter.start?.();
    const pid = await waitForPidFile(pidFile);
    const { closer, exits, errors } = recordingCloser();
    closer.close("stdin_end");
    await waitForExit(exits, 1500);
    assert.deepEqual(exits, [0]);
    assert.deepEqual(errors, []);
    const [serviceRoot] = serviceRoots;
    assert.ok(serviceRoot, "build created a service root");
    assert.equal(existsSync(serviceRoot), false);
    assert.equal(await waitForPidExit(pid), true);
    assert.throws(() => createFilteredWorkspace(source), /backend_unavailable/);
    assert.throws(
      () => spawnNativeLspProcess(process.execPath, [fake], {}),
      /backend_unavailable/,
    );
  } finally {
    ownedResources.seal();
    await removeTemporaryTree(temporary);
  }
});
