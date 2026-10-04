import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { hookTargets } from "../../scripts/hook-targets.mjs";

test("unsupported tools and Markdown have no gate target", () => {
  assert.deepEqual(hookTargets({ tool_name: "Bash", tool_input: {} }), []);
  const directory = mkdtempSync(resolve(tmpdir(), "quality-guard-markdown-"));
  const filePath = resolve(directory, "notes.md");
  writeFileSync(filePath, "# Notes\n");
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "..", "..", "scripts", "quality-guard.mjs")],
    {
      input: JSON.stringify({
        tool_name: "Write",
        tool_input: { file_path: filePath },
      }),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0);
  rmSync(directory, { recursive: true });
});

test("the launcher skips an external source target but gates repository files", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "quality-guard-boundary-"));
  const externalPath = resolve(directory, "external.py");
  const source = [
    "def deeply_nested(value):",
    "    if value:",
    "        if value:",
    "            if value:",
    "                if value:",
    "                    if value:",
    "                        if value:",
    "                            return value",
    "    return value",
  ].join("\n");
  writeFileSync(externalPath, source);
  const launcher = resolve(
    import.meta.dirname,
    "..",
    "..",
    "scripts",
    "quality-guard.mjs",
  );
  const input = JSON.stringify({
    tool_name: "Write",
    tool_input: { file_path: externalPath },
  });
  const externalResult = spawnSync(process.execPath, [launcher], {
    input,
    encoding: "utf8",
  });
  assert.equal(externalResult.status, 0);
  const externalProtocol = JSON.parse(externalResult.stdout);
  assert.equal(
    externalProtocol.hookSpecificOutput.hookEventName,
    "PostToolUse",
  );
  assert.match(
    externalProtocol.hookSpecificOutput.additionalContext,
    /advisory unavailable/,
  );
  assert.match(
    externalProtocol.hookSpecificOutput.additionalContext,
    /no Git repository root/,
  );

  const repository = resolve(directory, "repository");
  mkdirSync(resolve(repository, ".git"), { recursive: true });
  const repositoryPath = resolve(repository, "nested.py");
  writeFileSync(repositoryPath, source);
  const repositoryResult = spawnSync(process.execPath, [launcher], {
    input: JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: repositoryPath },
    }),
    encoding: "utf8",
  });
  assert.equal(repositoryResult.status, 0);
  const repositoryProtocol = JSON.parse(repositoryResult.stdout);
  assert.equal(
    repositoryProtocol.hookSpecificOutput.hookEventName,
    "PostToolUse",
  );
  assert.match(
    repositoryProtocol.hookSpecificOutput.additionalContext,
    /quality-guard advisory findings for/,
  );
  assert.match(
    repositoryProtocol.hookSpecificOutput.additionalContext,
    /\[error\]/,
  );
  assert.match(
    repositoryProtocol.hookSpecificOutput.additionalContext,
    /The write continues/,
  );
  rmSync(directory, { recursive: true });
});
