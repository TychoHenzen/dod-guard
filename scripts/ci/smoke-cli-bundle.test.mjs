import { rejects, strictEqual } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runCli, smokeCliBundle } from "./smoke-cli-bundle.mjs";

const temporaryDirectories = [];
after(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

function fixtureBundle(output, exitCode = 0) {
  const directory = mkdtempSync(join(tmpdir(), "cli-bundle-smoke-"));
  temporaryDirectories.push(directory);
  const bundle = join(directory, "bundle.mjs");
  writeFileSync(bundle, `process.stdout.write(${JSON.stringify(output)}); process.exitCode = ${exitCode};\n`);
  return bundle;
}

describe("smoke-cli-bundle", () => {
  it("accepts the current startup contract", async () => {
    const bundle = fixtureBundle("fossil 1.2.3\n");
    const result = await smokeCliBundle(bundle, "1.2.3");
    strictEqual(result.code, 0);
  });

  it("preserves raw CLI output for the later analyze JSON assertion", async () => {
    const bundle = fixtureBundle('{"schemaVersion":1}\n');
    const result = await runCli(bundle, ["analyze", "--format", "json"]);
    strictEqual(result.stdout, '{"schemaVersion":1}\n');
  });

  it("rejects a nonzero startup result", async () => {
    await rejects(smokeCliBundle(fixtureBundle("", 1), "1.2.3"), /exited with code 1/);
  });
});
