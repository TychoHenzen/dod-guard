import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { scanProject } from "./scan-agent-setup.mjs";

test("finds instruction sources and environment-specific signals", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-migrate-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(path.join(root, ".claude", "commands"), { recursive: true });
  await mkdir(path.join(root, "nested"), { recursive: true });
  await writeFile(path.join(root, "AGENTS.md"), "Use request_user_input when available.\nMCP is portable.\n");
  await writeFile(path.join(root, "CLAUDE.md"), "@AGENTS.md\n");
  await writeFile(path.join(root, "nested", "AGENTS.override.md"), "Use CODEX_HOME.\n");
  await writeFile(path.join(root, ".claude", "commands", "review.md"), "Call AskUserQuestion.\n");
  await writeFile(path.join(root, ".mcp.json"), "{}\n");
  await mkdir(path.join(root, "node_modules", "ignored"), { recursive: true });
  await writeFile(path.join(root, "node_modules", "ignored", "CLAUDE.md"), "AskUserQuestion\n");

  const report = await scanProject(root);

  assert.equal(report.claudeAdapter, "canonical");
  assert.deepEqual(report.instructionFiles, ["AGENTS.md", "CLAUDE.md", "nested/AGENTS.override.md"]);
  assert.deepEqual(report.configurationFiles, [".mcp.json"]);
  assert.ok(report.findings.some((finding) => finding.signal === "AskUserQuestion"));
  assert.ok(report.findings.some((finding) => finding.signal === "request_user_input"));
  assert.ok(report.findings.some((finding) => finding.signal === "MCP"));
  assert.ok(!report.findings.some((finding) => finding.file.includes("node_modules")));
});

test("marks a non-adapter CLAUDE.md as custom", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-migrate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "CLAUDE.md"), "Project guidance for Claude.\n");

  const report = await scanProject(root);

  assert.equal(report.claudeAdapter, "custom");
});
