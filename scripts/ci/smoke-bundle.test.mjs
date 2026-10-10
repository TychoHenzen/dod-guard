import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { qualityGuardToolProblems } from "./lib/quality-guard-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoots = [];

function tool(name, properties = {}) {
  return { name, inputSchema: { type: "object", properties } };
}

// A stdio stub that answers initialize and tools/list the way a real bundle does.
function stubBundleSource(tools) {
  return `const tools = ${JSON.stringify(tools)};
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  const lines = (buffer + chunk).split("\\n");
  buffer = lines.pop();
  for (const line of lines) {
    if (line.trim() === "") continue;
    const message = JSON.parse(line);
    if (message.id === undefined) continue;
    process.stdout.write(JSON.stringify(respond(message)) + "\\n");
  }
});
function respond(message) {
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "quality-guard", version: "0.0.0-fixture" },
      },
    };
  }
  if (message.method === "tools/list") {
    return { jsonrpc: "2.0", id: message.id, result: { tools } };
  }
  return { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "method not found" } };
}
`;
}

function makeFixtureRoot(tools) {
  const root = mkdtempSync(join(tmpdir(), "smoke-bundle-main-"));
  fixtureRoots.push(root);
  const ciDir = join(root, "scripts", "ci");
  mkdirSync(ciDir, { recursive: true });
  copyFileSync(join(here, "smoke-bundle.mjs"), join(ciDir, "smoke-bundle.mjs"));
  cpSync(join(here, "lib"), join(ciDir, "lib"), { recursive: true });

  const pkgDir = join(root, "packages", "quality-guard");
  mkdirSync(join(pkgDir, ".codex-plugin"), { recursive: true });
  mkdirSync(join(pkgDir, "dist"), { recursive: true });
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({ name: "quality-guard", version: "0.0.0-fixture" }, null, 2),
  );
  writeFileSync(
    join(pkgDir, ".codex-plugin", "plugin.json"),
    JSON.stringify(
      {
        name: "quality-guard",
        mcpServers: {
          "quality-guard": { type: "http", url: "http://127.0.0.1:21720/servers/quality-guard/mcp" },
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(pkgDir, "dist", "bundle.js"), stubBundleSource(tools));
  return root;
}

function runSmokeBundle(tools) {
  const root = makeFixtureRoot(tools);
  return spawnSync(process.execPath, [join(root, "scripts", "ci", "smoke-bundle.mjs"), "quality-guard"], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("smoke-bundle quality-guard tool contract", () => {
  it("accepts the three tools when none declares a profile input", () => {
    const tools = [tool("quality_report"), tool("quality_scan"), tool("quality_test_quality")];
    deepStrictEqual(qualityGuardToolProblems(tools), []);
  });

  it("reports a profile input declared by quality_scan", () => {
    const tools = [
      tool("quality_report"),
      tool("quality_scan", { path: { type: "string" }, profile: { type: "string" } }),
      tool("quality_test_quality"),
    ];
    deepStrictEqual(qualityGuardToolProblems(tools), ["quality_scan declares a retired profile input"]);
  });

  it("reports a profile input declared by quality_report", () => {
    const tools = [
      tool("quality_report", { profile: { type: "string" } }),
      tool("quality_scan"),
      tool("quality_test_quality"),
    ];
    deepStrictEqual(qualityGuardToolProblems(tools), ["quality_report declares a retired profile input"]);
  });

  it("reports a missing quality_test_quality tool", () => {
    const tools = [tool("quality_report"), tool("quality_scan")];
    deepStrictEqual(qualityGuardToolProblems(tools), ["missing required tool quality_test_quality"]);
  });
});

describe("smoke-bundle main exit code for the quality-guard tool contract", () => {
  after(() => {
    for (const root of fixtureRoots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits 0 and prints the contract OK line for a valid tool list", () => {
    const result = runSmokeBundle([tool("quality_report"), tool("quality_scan"), tool("quality_test_quality")]);
    const detail = `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
    strictEqual(result.status, 0, detail);
    ok(result.stdout.includes("quality-guard tool contract OK"), detail);
  });

  it("exits 1 when quality_scan declares a profile input", () => {
    const result = runSmokeBundle([
      tool("quality_report"),
      tool("quality_scan", { path: { type: "string" }, profile: { type: "string" } }),
      tool("quality_test_quality"),
    ]);
    const detail = `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
    strictEqual(result.status, 1, detail);
    ok(result.stdout.includes("smoke FAILED for quality-guard tool contract"), detail);
    ok(result.stdout.includes("quality_scan declares a retired profile input"), detail);
  });

  it("exits 1 when quality_test_quality is missing", () => {
    const result = runSmokeBundle([tool("quality_report"), tool("quality_scan")]);
    const detail = `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
    strictEqual(result.status, 1, detail);
    ok(result.stdout.includes("smoke FAILED for quality-guard tool contract"), detail);
    ok(result.stdout.includes("missing required tool quality_test_quality"), detail);
  });
});
