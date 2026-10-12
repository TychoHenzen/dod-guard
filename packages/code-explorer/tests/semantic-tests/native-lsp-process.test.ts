import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnNativeLspProcess } from "../../src/semantic/adapters/native-lsp-process.js";

it("uses a shell-free child process \
with caller-owned environment", async () => {
  const lspProcess = spawnNativeLspProcess(
    process.execPath,
    ["-e", "process.stdout.write(process.env.VISIBLE ?? 'missing')"],
    {
      VISIBLE: "bounded",
    },
  );
  const chunks: string[] = [];
  const exited = new Promise<void>((resolve) =>
    lspProcess.onExit(() => resolve()),
  );
  lspProcess.onStdout((chunk) => chunks.push(new TextDecoder().decode(chunk)));
  await exited;
  assert.equal(chunks.join(""), "bounded");
});

it("a write after the backend closes its stdin does not crash the server process", () => {
  const adapter = new URL(
    "../../src/semantic/adapters/native-lsp-process.js",
    import.meta.url,
  );
  assert.equal(existsSync(fileURLToPath(adapter)), true);
  const temporary = mkdtempSync(join(tmpdir(), "code-explorer-epipe-test-"));
  try {
    const script = join(temporary, "epipe-script.mjs");
    writeFileSync(script, epipeScript(adapter.href));
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("done"), true, result.stderr);
    assert.equal(
      result.stderr.includes("Unhandled 'error'"),
      false,
      result.stderr,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

function epipeScript(adapterHref: string): string {
  return [
    `import { spawnNativeLspProcess } from ${JSON.stringify(adapterHref)};`,
    "const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
    "const child = spawnNativeLspProcess(",
    "  process.execPath,",
    '  ["-e", "process.stdin.destroy(); setTimeout(() => {}, 1500)"],',
    '  { SYSTEMROOT: process.env.SYSTEMROOT ?? "" },',
    ");",
    "await pause(300);",
    "for (let index = 0; index < 5; index += 1)",
    "  child.write(new Uint8Array(1 << 20));",
    "await new Promise((resolve) => child.onExit(() => resolve()));",
    "await pause(200);",
    'process.stdout.write("done");',
  ].join("\n");
}
