import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
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
import {
  removeTemporaryTree,
  waitForPidExit,
  waitForPidFile,
} from "../testing/index/index-test-fake-backend.js";
import {
  fakeBackendFixture,
  isolatedRegistry,
  recordingCloser,
  spawnKeepaliveBackend,
  waitForExit,
} from "../testing/index/stdio-close-test-support.js";
import { presentRustAdapter } from "./lazy-adapter-test-support.js";

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

it("stdio close during an in-flight start leaves no process and no root", async () => {
  const fixture = fakeBackendFixture("code-explorer-lazy-close-");
  const resources = isolatedRegistry();
  const source = createNativeProjectRoot(fixture.project);
  const serviceRoots: string[] = [];
  const adapter = presentRustAdapter(() => {
    const filtered = createFilteredWorkspace(source, resources);
    serviceRoots.push(dirname(filtered.root.canonicalPath));
    spawnKeepaliveBackend(fixture, resources);
    return createRustAdapter({
      backend: {
        readiness: () => ({ state: "initializing" }),
        query: async () => searchResult,
        start: pending,
      },
      compatible: true,
      backend_version: "fake",
    });
  });
  try {
    void adapter.start?.();
    const pid = await waitForPidFile(fixture.pidFile);
    const { closer, exits, errors } = recordingCloser(resources);
    closer.close("stdin_end");
    await waitForExit(exits, 1500);
    assert.deepEqual(exits, [0]);
    assert.deepEqual(errors, []);
    const [serviceRoot] = serviceRoots;
    assert.ok(serviceRoot, "build created a service root");
    assert.equal(existsSync(serviceRoot), false);
    assert.equal(await waitForPidExit(pid), true);
    assert.throws(
      () => createFilteredWorkspace(source, resources),
      /backend_unavailable/,
    );
    assert.throws(
      () => spawnNativeLspProcess(process.execPath, [fixture.fake], {}, resources),
      /backend_unavailable/,
    );
  } finally {
    resources.seal();
    await removeTemporaryTree(fixture.temporary);
  }
});
