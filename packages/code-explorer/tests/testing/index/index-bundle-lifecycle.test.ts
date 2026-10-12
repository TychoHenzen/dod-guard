import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SERVICE_ROOT_PREFIXES } from "../../../src/semantic/workspace/service-root.js";
import { type BundleExit, bundlePath } from "./index-test-bundle-process.js";
import { removeTemporaryTree } from "./index-test-fake-backend.js";
import { isolatedBackendEnvironment } from "./index-test-isolated-env.js";

const exitBudgetMs = 2_000;
const statusTimeoutMs = 10_000;
const statusPollMs = 50;

type StatusBackend = {
  language: string;
  state: string;
  failure_code?: string;
};

function writeProject(temporary: string): string {
  const project = join(temporary, "project");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "src", "main.rs"), "fn main() {}\n", "utf8");
  return project;
}

function createBundleClient(temporary: string, project: string) {
  const client = new Client({
    name: "code-explorer-bundle-lifecycle-test",
    version: "1.0.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bundlePath(), "--project-root", project],
    cwd: project,
    env: isolatedBackendEnvironment(temporary),
    stderr: "pipe",
  });
  // Drained from the start so a chatty child cannot block on a full pipe.
  let stderrText = "";
  transport.stderr?.on("data", (chunk: Buffer) => {
    stderrText += chunk.toString("utf8");
  });
  return { client, transport, stderr: () => stderrText };
}

/** Must run right after connect: the SDK clears its child reference on close. */
function watchExit(transport: StdioClientTransport): Promise<BundleExit> {
  const child = (transport as unknown as { _process?: ChildProcess })._process;
  assert.ok(
    child,
    "StdioClientTransport no longer exposes _process; update this test",
  );
  return new Promise<BundleExit>((resolve) => {
    child.once("exit", (code, signal) => {
      resolve({ code, signal, at: performance.now() });
    });
  });
}

function entryFor(backends: StatusBackend[], language: string): StatusBackend {
  const entry = backends.find((backend) => backend.language === language);
  assert.ok(
    entry,
    `code_status has no ${language} entry: ${JSON.stringify(backends)}`,
  );
  return entry;
}

async function readBackends(client: Client): Promise<StatusBackend[]> {
  const response = (await client.callTool({
    name: "code_status",
    arguments: { action: "status" },
  })) as { content: Array<{ text: string }> };
  const envelope = JSON.parse(response.content[0]?.text ?? "") as {
    data: { backend_status: { backends: StatusBackend[] } };
  };
  return envelope.data.backend_status.backends;
}

async function waitForSettledLanguages(
  client: Client,
  readStderr: () => string,
): Promise<StatusBackend[]> {
  const deadline = Date.now() + statusTimeoutMs;
  for (;;) {
    const backends = await readBackends(client);
    const python = entryFor(backends, "python");
    const csharp = entryFor(backends, "csharp");
    if (python.state !== "initializing" && csharp.state !== "initializing")
      return backends;
    if (Date.now() >= deadline)
      throw new Error(
        `code_status_timeout:${JSON.stringify(backends)} stderr:${readStderr()}`,
      );
    await new Promise((resolve_) => setTimeout(resolve_, statusPollMs));
  }
}

function assertAbsentLanguages(backends: StatusBackend[]): void {
  for (const language of ["python", "csharp"]) {
    const entry = entryFor(backends, language);
    assert.equal(entry.state, "unavailable", JSON.stringify(entry));
    assert.equal(
      entry.failure_code,
      "language_not_present",
      JSON.stringify(entry),
    );
  }
  const rust = entryFor(backends, "rust");
  assert.notEqual(
    rust.failure_code,
    "language_not_present",
    JSON.stringify(rust),
  );
}

async function closeAndMeasure(
  client: Client,
  exited: Promise<BundleExit>,
  readStderr: () => string,
): Promise<void> {
  const t0 = performance.now();
  await client.close();
  const result = await exited;
  assert.equal(result.code, 0, `exit code; stderr: ${readStderr()}`);
  assert.equal(result.signal, null, `exit signal; stderr: ${readStderr()}`);
  assert.ok(
    result.at - t0 < exitBudgetMs,
    `exit took ${result.at - t0} ms; stderr: ${readStderr()}`,
  );
}

function assertNoServiceRoots(temporary: string): void {
  const leftovers = readdirSync(join(temporary, "tmp")).filter((name) =>
    SERVICE_ROOT_PREFIXES.some((prefix) => name.startsWith(prefix)),
  );
  assert.deepEqual(leftovers, []);
}

it("an MCP client reads language_not_present for absent languages and the bundle exits 0 within 2 s of close", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "code-explorer-lifecycle-"));
  const project = writeProject(temporary);
  const { client, transport, stderr } = createBundleClient(temporary, project);
  try {
    await client.connect(transport);
    const exited = watchExit(transport);
    const backends = await waitForSettledLanguages(client, stderr);
    assertAbsentLanguages(backends);
    await closeAndMeasure(client, exited, stderr);
    assertNoServiceRoots(temporary);
  } finally {
    // Close before removal: the bundle's working directory is inside the tree.
    try {
      await client.close();
    } finally {
      await removeTemporaryTree(temporary);
    }
  }
});
