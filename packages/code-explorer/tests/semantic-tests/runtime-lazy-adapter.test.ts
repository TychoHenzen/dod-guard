import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { it } from "node:test";
import { createServer } from "../../src/index.js";
import {
  createRustAdapter,
  type LanguageAdapter,
} from "../../src/semantic/adapters/language-adapter.js";
import { createLanguageAdapter } from "../../src/semantic/adapters/language-adapter-factory.js";
import { configuredCapabilities } from "../../src/semantic/adapters/language-adapter-status.js";
import type {
  Language,
  SemanticResult,
} from "../../src/semantic/contracts/contract.js";
import { createNativeProjectRoot } from "../../src/semantic/project-root/project-root.js";
import { languagePresent } from "../../src/semantic/runtime/language-presence.js";
import { createRuntimeAdapters } from "../../src/semantic/runtime/runtime-bootstrap.js";
import { createLazyRuntimeAdapter } from "../../src/semantic/runtime/runtime-lazy-adapter.js";
import type { CodeExplorerServer } from "../../src/server/server-contract.js";
import {
  OWNER_MARKER_FILE,
  SERVICE_ROOT_PREFIXES,
} from "../../src/semantic/workspace/service-root.js";

const capabilities = configuredCapabilities(undefined);
const languages: readonly Language[] = ["rust", "python", "csharp"];
const searchResult: SemanticResult = {
  operation: "search",
  revision: { generation: 0, manifest_sha256: "fixture" },
  symbols: [],
};

type Builds = Record<Language, number>;
type BackendEntry = { language: string; state: string; failure_code?: string };

function emptyBuilds(): Builds {
  return { rust: 0, python: 0, csharp: 0 };
}

function pending<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (value) => settle?.(value) };
}

async function settleWithin<T>(promise: Promise<T>, ms = 2000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("blocked_by_backend_start")), ms);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function backendFor(
  language: Language,
  start?: () => Promise<void>,
): LanguageAdapter {
  return createLanguageAdapter(language, {
    backend: {
      readiness: () => ({ state: "ready" }),
      query: async () => searchResult,
      ...(start ? { start } : {}),
    },
    compatible: true,
    backend_version: "fake",
  });
}

function blockingRust(counter: { starts: number }): LanguageAdapter {
  return createRustAdapter({
    backend: {
      readiness: () => ({ state: "initializing" }),
      query: async () => searchResult,
      start: () => {
        counter.starts += 1;
        return pending<void>();
      },
    },
    compatible: true,
    backend_version: "fake",
  });
}

function lazyAdapter(input: {
  language: Language;
  isPresent: () => Promise<boolean>;
  builds: Builds;
  start?: () => Promise<void>;
}): LanguageAdapter {
  return createLazyRuntimeAdapter({
    language: input.language,
    backendName: `${input.language}-fake`,
    capabilities,
    isPresent: input.isPresent,
    build: () => {
      input.builds[input.language] += 1;
      return backendFor(input.language, input.start);
    },
  });
}

async function statusOf(
  server: CodeExplorerServer,
  arguments_: Record<string, unknown> = { action: "status" },
): Promise<Record<string, unknown>> {
  const response = await server.call("code_status", arguments_);
  assert.ok("data" in response, JSON.stringify(response));
  return response.data;
}

function backendsIn(data: Record<string, unknown>): BackendEntry[] {
  return (data.backend_status as { backends: BackendEntry[] }).backends;
}

function entryFor(
  backends: readonly BackendEntry[],
  language: string,
): BackendEntry | undefined {
  return backends.find((backend) => backend.language === language);
}

function projectWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-lazy-project-"));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text, "utf8");
  }
  return root;
}

function ownerPidOf(root: string): number | undefined {
  try {
    const marker = JSON.parse(
      readFileSync(join(root, OWNER_MARKER_FILE), "utf8"),
    ) as { pid?: number };
    return marker.pid;
  } catch {
    return undefined;
  }
}

function ownedRootsFor(pid: number): string[] {
  const temporary = tmpdir();
  return readdirSync(temporary).filter(
    (name) =>
      SERVICE_ROOT_PREFIXES.some((prefix) => name.startsWith(prefix)) &&
      ownerPidOf(join(temporary, name)) === pid,
  );
}

async function statusAfterStart(
  root: string,
  builds: Builds,
): Promise<BackendEntry[]> {
  const adapters = languages.map((language) =>
    lazyAdapter({
      language,
      isPresent: () => languagePresent(language, root),
      builds,
    }),
  );
  const server = createServer({ adapters });
  try {
    await settleWithin(statusOf(server));
    await Promise.allSettled(adapters.map((adapter) => adapter.start?.()));
    return backendsIn(await statusOf(server));
  } finally {
    await server.close();
  }
}

it("construction runs no presence check, no build and no start", () => {
  let checks = 0;
  let starts = 0;
  const builds = emptyBuilds();
  const adapter = createLazyRuntimeAdapter({
    language: "rust",
    backendName: "rust-analyzer",
    capabilities,
    isPresent: async () => {
      checks += 1;
      return true;
    },
    build: () => {
      builds.rust += 1;
      return backendFor("rust", async () => {
        starts += 1;
      });
    },
  });
  assert.equal(checks, 0);
  assert.equal(builds.rust, 0);
  assert.equal(starts, 0);
  assert.equal(adapter.status().state, "initializing");
});

it("real runtime adapters create no owned root before start", () => {
  const root = projectWith({
    "src/main.rs": "fn main() {}\n",
    "src/a.py": "x = 1\n",
    "src/a.cs": "class A {}\n",
  });
  try {
    const adapters = createRuntimeAdapters(createNativeProjectRoot(root));
    assert.deepEqual(
      adapters.map((adapter) => adapter.status().state),
      ["initializing", "initializing", "initializing"],
    );
    assert.deepEqual(ownedRootsFor(process.pid), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("the first tool call starts every adapter without awaiting", async () => {
  const first = { starts: 0 };
  const second = { starts: 0 };
  const server = createServer({
    adapters: [blockingRust(first), blockingRust(second)],
  });
  try {
    await settleWithin(statusOf(server));
    assert.deepEqual([first.starts, second.starts], [1, 1]);
    await settleWithin(statusOf(server));
    assert.deepEqual([first.starts, second.starts], [1, 1]);
  } finally {
    await server.close();
  }
});

it("start_session as the first call also starts every adapter", async () => {
  const counter = { starts: 0 };
  const server = createServer({ adapters: [blockingRust(counter)] });
  try {
    await settleWithin(
      server.call("code_status", { action: "start_session" }),
    );
    assert.equal(counter.starts, 1);
  } finally {
    await server.close();
  }
});

it("code_status shows a starting backend as initializing", async () => {
  const builds = emptyBuilds();
  const adapter = lazyAdapter({
    language: "rust",
    isPresent: () => pending<boolean>(),
    builds,
  });
  const server = createServer({ adapters: [adapter] });
  try {
    const backends = backendsIn(await settleWithin(statusOf(server)));
    assert.equal(entryFor(backends, "rust")?.state, "initializing");
    assert.equal(builds.rust, 0);
  } finally {
    await server.close();
  }
});

it("a semantic query awaits only its own backend start", async () => {
  const builds = emptyBuilds();
  const present = lazyAdapter({
    language: "rust",
    isPresent: async () => true,
    builds,
  });
  const waiting = lazyAdapter({
    language: "python",
    isPresent: () => pending<boolean>(),
    builds,
  });
  void waiting.start?.();
  const result = await settleWithin(
    present.request({ operation: "search", query: "symbol" }),
  );
  assert.deepEqual(result, searchResult);
  assert.equal(builds.python, 0);
});

it("an rs-only project reports python and csharp language_not_present without build", async () => {
  const root = projectWith({ "src/main.rs": "fn main() {}\n" });
  try {
    const builds = emptyBuilds();
    const backends = await statusAfterStart(root, builds);
    for (const language of ["python", "csharp"]) {
      assert.equal(entryFor(backends, language)?.state, "unavailable");
      assert.equal(
        entryFor(backends, language)?.failure_code,
        "language_not_present",
      );
    }
    assert.notEqual(
      entryFor(backends, "rust")?.failure_code,
      "language_not_present",
    );
    assert.deepEqual(builds, { rust: 1, python: 0, csharp: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("rust sources only under target/ report rust language_not_present", async () => {
  const root = projectWith({ "target/debug/x.rs": "fn x() {}\n" });
  try {
    const builds = emptyBuilds();
    const backends = await statusAfterStart(root, builds);
    assert.equal(entryFor(backends, "rust")?.state, "unavailable");
    assert.equal(
      entryFor(backends, "rust")?.failure_code,
      "language_not_present",
    );
    assert.deepEqual(builds, { rust: 0, python: 0, csharp: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("code_status refresh moves python out of language_not_present", async () => {
  const root = projectWith({ "src/main.rs": "fn main() {}\n" });
  const builds = emptyBuilds();
  const adapters = languages.map((language) =>
    lazyAdapter({
      language,
      isPresent: () => languagePresent(language, root),
      builds,
    }),
  );
  const server = createServer({ adapters });
  try {
    const started = await settleWithin(
      server.call("code_status", { action: "start_session" }),
    );
    assert.ok("data" in started, JSON.stringify(started));
    await Promise.allSettled(adapters.map((adapter) => adapter.start?.()));
    writeFileSync(join(root, "src", "a.py"), "x = 1\n", "utf8");
    const refreshed = backendsIn(
      await statusOf(server, {
        action: "refresh",
        session_id: started.data.session_id,
        request_id: "refresh-request-0001",
      }),
    );
    assert.notEqual(
      entryFor(refreshed, "python")?.failure_code,
      "language_not_present",
    );
    assert.equal(builds.python, 1);
  } finally {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("concurrent refresh and start build at most once", async () => {
  const presence = deferred<boolean>();
  const builds = emptyBuilds();
  const adapter = lazyAdapter({
    language: "rust",
    isPresent: () => presence.promise,
    builds,
  });
  const starting = adapter.start?.();
  const refreshing = adapter.refresh?.();
  presence.resolve(true);
  await Promise.all([starting, refreshing]);
  assert.equal(builds.rust, 1);
  assert.equal(adapter.status().state, "ready");
});
