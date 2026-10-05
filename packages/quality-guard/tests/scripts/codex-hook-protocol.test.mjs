import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

test("the hook emits advisory findings through the exit-0 JSON protocol", () => {
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
  const externalResult = spawnSync(process.execPath, [launcher], {
    input: JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: externalPath },
    }),
    encoding: "utf8",
  });
  assert.equal(externalResult.status, 0);
  const externalContext = JSON.parse(externalResult.stdout).hookSpecificOutput;
  assert.equal(externalContext.hookEventName, "PostToolUse");
  assert.match(externalContext.additionalContext, /advisory unavailable/);
  assert.match(externalContext.additionalContext, /no Git repository root/);

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
  const repositoryContext = JSON.parse(
    repositoryResult.stdout,
  ).hookSpecificOutput;
  assert.equal(repositoryContext.hookEventName, "PostToolUse");
  assert.match(
    repositoryContext.additionalContext,
    /quality-guard advisory findings for/,
  );
  assert.match(repositoryContext.additionalContext, /\[high\]/);
  assert.match(repositoryContext.additionalContext, /The write continues/);
  rmSync(directory, { recursive: true });
});
