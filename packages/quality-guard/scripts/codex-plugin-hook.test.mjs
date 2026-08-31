import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(import.meta.url), "..", "..");

test("Codex plugin ships a discoverable PostToolUse hook", () => {
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, ".codex-plugin", "plugin.json"), "utf8"));
  const config = JSON.parse(readFileSync(resolve(packageRoot, "hooks", "hooks.json"), "utf8"));

  assert.equal("hooks" in manifest, false, "Codex discovers the default hooks/hooks.json path");
  assert.deepEqual(config.hooks?.PostToolUse, [
    {
      matcher: "apply_patch|Write|Edit|MultiEdit",
      hooks: [
        {
          type: "command",
          command: 'node "${PLUGIN_ROOT}/scripts/quality-guard.mjs"',
          commandWindows: '"${PLUGIN_ROOT}\\scripts\\quality-guard-hook.cmd"',
          timeout: 30,
          statusMessage: "quality-guard: checking structure...",
        },
      ],
    },
  ]);
  assert.equal(existsSync(resolve(packageRoot, "scripts", "quality-guard-hook.cmd")), true);
});

test("Windows launcher forwards a Codex hook payload to the Node hook", { skip: process.platform !== "win32" }, () => {
  const directory = mkdtempSync(resolve(tmpdir(), "quality-guard-hook-launch-"));
  const filePath = resolve(directory, "clean.ts");
  const launcher = resolve(packageRoot, "scripts", "quality-guard-hook.cmd");
  writeFileSync(filePath, "export const answer = 42;\n");
  const input = {
    cwd: directory,
    tool_name: "apply_patch",
    tool_input: {
      command: [
        "*** Begin Patch",
        `*** Update File: ${filePath}`,
        "@@",
        "+export const answer = 42;",
        "*** End Patch",
      ].join("\n"),
    },
  };

  const result = spawnSync("cmd.exe", ["/d", "/s", "/c", `\"\"${launcher}\"\"`], {
    cwd: directory,
    encoding: "utf8",
    input: JSON.stringify(input),
    windowsVerbatimArguments: true,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /quality-guard file-local feedback passed/);
  rmSync(directory, { recursive: true });
});
