import { rejects, strictEqual } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { MCP_HANDSHAKE_PACKAGE_DIRECTORIES, runCli, smokeCliBundle } from "./smoke-cli-bundle.mjs";

const temporaryDirectories = [];
after(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

function fixturePackage({
  bundle = true,
  main = true,
  helpOutput = "Usage: fossil [options]\n",
  analyzeOutput,
  helpExitCode,
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "cli-bundle-smoke-"));
  temporaryDirectories.push(directory);
  const dist = join(directory, "dist");
  mkdirSync(dist);
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({
      name: "@dod-guard/fossil",
      version: "1.2.3",
      main: "dist/index.js",
      bin: { fossil: "dist/bundle.js" },
    }),
  );
  if (main) writeFileSync(join(dist, "index.js"), "export {};\n");
  if (bundle)
    writeFileSync(
      join(dist, "bundle.js"),
      `#!/usr/bin/env node
const arguments_ = process.argv.slice(2);
if (arguments_.includes("--help")) process.stdout.write(${JSON.stringify(helpOutput)});
if (arguments_.includes("--help")) process.exitCode = ${JSON.stringify(helpExitCode ?? 0)};
if (${JSON.stringify(analyzeOutput)} !== undefined && arguments_[0] === "analyze" && arguments_[1] === "--format" && arguments_[2] === "json") process.stdout.write(${JSON.stringify(analyzeOutput)});
`,
    );
  return directory;
}

describe("smoke-cli-bundle", () => {
  it("validates the CLI-only manifest, executable bundle, help command, and MCP exclusion", async () => {
    const packageDirectory = fixturePackage();
    const { manifest, result } = await smokeCliBundle(packageDirectory);

    strictEqual(manifest.bin.fossil, "dist/bundle.js");
    strictEqual(result.code, 0);
    strictEqual(result.stdout, "Usage: fossil [options]\n");
    strictEqual(MCP_HANDSHAKE_PACKAGE_DIRECTORIES.includes("fossil"), false);
  });

  it("rejects a package whose required CLI entrypoint is absent", async () => {
    await rejects(smokeCliBundle(fixturePackage({ bundle: false })), /CLI bundle not built/);
  });

  it("rejects a CLI help command that exits nonzero", async () => {
    await rejects(smokeCliBundle(fixturePackage({ helpExitCode: 7 })), /CLI help exited with code 7/);
  });

  it("preserves raw CLI output for the later fixture-analysis assertion", async () => {
    const output = '{"schemaVersion":1,"findings":[]}\n';
    const packageDirectory = fixturePackage({ analyzeOutput: output });
    const result = await runCli(join(packageDirectory, "dist", "bundle.js"), ["analyze", "--format", "json"]);
    strictEqual(result.stdout, output);
  });
});
