import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import * as stdio from "@modelcontextprotocol/sdk/client/stdio.js";
import { waitForPidExit } from "./index-test-fake-backend.js";
import { isolatedTempEnvironment } from "./index-test-isolated-env.js";
import {
  createStandaloneBackendRecord,
  type FakeBackendLog,
  removeTemporaryTree,
  roslynStorePath,
  waitForFakeConfiguration,
  writeFakeLspServer,
} from "./index-test-standalone-support.js";

const { StdioClientTransport } = stdio;
const entryPoint = fileURLToPath(
  new URL("../../../src/index.js", import.meta.url),
);
const backendStatusTimeoutMs = 30_000;
const backendStatusPollMs = 50;

type StandaloneStatus = {
  data: {
    backend_status: {
      backends: Array<{
        language: string;
        state: string;
        backend_version: string;
        capabilities: Record<string, { state: string }>;
      }>;
    };
  };
};

async function waitForStandaloneBackends(
  client: Client,
): Promise<StandaloneStatus> {
  const deadline = Date.now() + backendStatusTimeoutMs;
  for (;;) {
    const response = (await client.callTool({
      name: "code_status",
      arguments: { action: "status" },
    })) as { content: Array<{ text: string }> };
    const status = JSON.parse(
      response.content[0]?.text ?? "",
    ) as StandaloneStatus;
    const backends = status.data.backend_status.backends;
    if (
      backends.length === 3 &&
      backends.every(({ state }) => state !== "initializing")
    )
      return status;
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new Error(
        `standalone_backend_status_timeout:${JSON.stringify(backends)}`,
      );
    await new Promise((resolve_) =>
      setTimeout(resolve_, Math.min(backendStatusPollMs, remaining)),
    );
  }
}

it(
  "starts all approved standalone backends from a copied installed package " +
    "without project-path leakage",
  async () => {
    if (process.platform !== "win32") return;
    const temporary = mkdtempSync(
      join(tmpdir(), "code-explorer-standalone-ready-"),
    );
    const installed = join(temporary, "node_modules", "code-explorer");
    const project = join(temporary, "project");
    const backendRoot = join(temporary, "trusted-backends");
    const counters = Object.fromEntries(
      ["rust", "python", "csharp"].map((language) => [
        language,
        join(temporary, `${language}-counter.json`),
      ]),
    );
    const packageRoot = dirname(dirname(dirname(entryPoint)));
    try {
      mkdirSync(join(installed, "dist"), { recursive: true });
      mkdirSync(join(backendRoot, "node_modules", "pyright"), {
        recursive: true,
      });
      mkdirSync(project);
      writeFileSync(
        join(project, "module.py"),
        "def symbol():\n    return 1\n",
        "utf8",
      );
      mkdirSync(join(project, "src"));
      writeFileSync(
        join(project, "src", "lib.rs"),
        "pub fn symbol() {}\n",
        "utf8",
      );
      writeFileSync(join(project, "Program.cs"), "class Program {}\n", "utf8");
      for (const counter of Object.values(counters))
        writeFileSync(
          counter,
          JSON.stringify({
            starts: 0,
            shutdowns: 0,
            exits: 0,
            configuration_sections: [],
          }),
          "utf8",
        );
      for (const executable of ["rust-analyzer.exe", "node.exe"])
        copyFileSync(process.execPath, join(backendRoot, executable));
      const roslynStore = roslynStorePath(backendRoot);
      mkdirSync(roslynStore, { recursive: true });
      copyFileSync(
        process.execPath,
        join(roslynStore, "roslyn-language-server.exe"),
      );
      for (const language of ["rust", "python", "csharp"])
        writeFakeLspServer(
          join(backendRoot, "node_modules", "pyright", `${language}-server.js`),
        );
      writeFileSync(
        join(backendRoot, "node_modules", "pyright", "package.json"),
        JSON.stringify({ version: process.version.slice(1) }),
      );
      const { record, evidence } = createStandaloneBackendRecord(
        backendRoot,
        counters,
      );
      copyFileSync(
        join(packageRoot, "dist", "bundle.js"),
        join(installed, "dist", "bundle.js"),
      );
      copyFileSync(
        join(packageRoot, "package.json"),
        join(installed, "package.json"),
      );
      writeFileSync(
        join(installed, "adapter-selection.json"),
        JSON.stringify(record),
      );
      writeFileSync(
        join(installed, "adapter-selection-evidence.json"),
        JSON.stringify(evidence),
      );
      const client = new Client({
        name: "code-explorer-standalone-ready-test",
        version: "1.0.0",
      });
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [join(installed, "dist", "bundle.js"), "--project-root", project],
        cwd: project,
        env: {
          PATH: "",
          SystemRoot: process.env.SystemRoot ?? "",
          CODE_EXPLORER_BACKENDS_ROOT: backendRoot,
          ...isolatedTempEnvironment(temporary),
        },
      });
      try {
        await client.connect(transport);
        const status = await waitForStandaloneBackends(client);
        const backends = status.data.backend_status.backends;
        assert.deepEqual(
          backends.map(({ language }) => language),
          ["rust", "python", "csharp"],
        );
        assert.ok(
          backends.every(({ state }) => state === "degraded"),
          JSON.stringify(backends),
        );
        assert.ok(
          backends.every(
            ({ backend_version }) =>
              backend_version === process.version.slice(1),
          ),
        );
        assert.ok(
          backends.every(
            ({ capabilities }) => capabilities.definition?.state === "ready",
          ),
        );
        assert.equal(JSON.stringify(status).includes(project), false);
        await waitForFakeConfiguration(counters.python ?? "");
      } finally {
        await client.close();
      }
      for (const language of ["rust", "python", "csharp"]) {
        const log = JSON.parse(
          readFileSync(counters[language] ?? "", "utf8"),
        ) as FakeBackendLog;
        assert.equal(
          log.starts,
          1,
          `${language} launched once after the pre-spawn identity check`,
        );
        assert.ok(typeof log.pid === "number", `${language} recorded its pid`);
        assert.equal(
          await waitForPidExit(log.pid),
          true,
          `${language} fake exited with the client close`,
        );
        assert.deepEqual(
          log.configuration_sections,
          language === "python" ? ["[]", "[]", "[]"] : [],
        );
        assert.equal(
          JSON.stringify(log.initialization_options).includes(project),
          false,
        );
        if (language === "python") {
          assert.notEqual(
            log.root_uri,
            new URL(`file:///${project.replaceAll("\\", "/")}/`).href,
          );
          assert.match(log.root_uri ?? "", /^file:/);
          assert.equal(
            (log.root_uri ?? "").includes(project.replaceAll("\\", "/")),
            false,
          );
        }
      }
    } finally {
      await removeTemporaryTree(temporary);
    }
  },
);
