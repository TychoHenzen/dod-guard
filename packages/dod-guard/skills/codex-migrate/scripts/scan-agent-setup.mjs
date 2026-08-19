#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nyc_output",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);

const INSTRUCTION_NAMES = new Set([
  "AGENTS.md",
  "AGENTS.override.md",
  "CLAUDE.md",
  "CLAUDE.local.md",
]);

const CONFIG_NAMES = new Set([".mcp.json", "config.toml", "plugin.json"]);

const PATTERNS = [
  ["claude-only", "AskUserQuestion", /\bAskUserQuestion\b/g],
  ["claude-only", "CLAUDE_PLUGIN_ROOT", /\bCLAUDE_PLUGIN_ROOT\b/g],
  ["claude-only", "Claude settings path", /(?:^|[\\/])\.claude(?:[\\/]|$)/gm],
  ["claude-only", "Claude home path", /~[\\/]\.claude\b/g],
  ["claude-only", "Claude subagent_type", /\bsubagent_type\b/g],
  ["claude-only", "Claude plugin command", /\/(?:plugin|reload-plugins)\b/g],
  ["codex-only", "request_user_input", /\brequest_user_input\b/g],
  ["codex-only", "CODEX_HOME", /\bCODEX_HOME\b/g],
  ["codex-only", "Codex config path", /(?:^|[\\/])\.codex(?:[\\/]|$)/gm],
  ["portable", "MCP", /\bMCP\b|Model Context Protocol/g],
];

function relative(root, file) {
  const value = path.relative(root, file);
  return value.length === 0 ? "." : value.split(path.sep).join("/");
}

async function collectFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) files.push(...await collectFiles(root, fullPath));
      continue;
    }

    if (entry.isFile()) files.push(fullPath);
  }

  return files;
}

function relevantFile(file) {
  const name = path.basename(file);
  const normalized = file.split(path.sep).join("/");
  return INSTRUCTION_NAMES.has(name)
    || CONFIG_NAMES.has(name)
    || normalized.includes("/.claude/")
    || normalized.includes("/.codex/")
    || normalized.includes("/.agents/skills/")
    || normalized.includes("/skills/");
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function scanText(root, file, text) {
  const findings = [];
  for (const [category, signal, expression] of PATTERNS) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      findings.push({
        category,
        file: relative(root, file),
        line: lineNumber(text, match.index ?? 0),
        signal,
      });
    }
  }
  return findings;
}

export async function scanProject(rootPath) {
  const root = path.resolve(rootPath);
  const rootStats = await stat(root);
  if (!rootStats.isDirectory()) throw new Error(`Project root is not a directory: ${root}`);

  const files = (await collectFiles(root)).filter(relevantFile);
  const instructionFiles = files
    .filter((file) => INSTRUCTION_NAMES.has(path.basename(file)))
    .map((file) => relative(root, file));
  const configurationFiles = files
    .filter((file) => CONFIG_NAMES.has(path.basename(file)))
    .map((file) => relative(root, file));
  const findings = [];

  for (const file of files) {
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    findings.push(...scanText(root, file, text));
  }

  const rootClaude = path.join(root, "CLAUDE.md");
  let claudeAdapter = "absent";
  if (files.includes(rootClaude)) {
    const content = (await readFile(rootClaude, "utf8")).trim();
    claudeAdapter = content === "@AGENTS.md" ? "canonical" : "custom";
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.signal.localeCompare(b.signal));

  return {
    root,
    claudeAdapter,
    instructionFiles,
    configurationFiles,
    findings,
  };
}

function formatReport(report) {
  const lines = [
    `Project: ${report.root}`,
    `CLAUDE.md adapter: ${report.claudeAdapter}`,
    `Instruction files: ${report.instructionFiles.length}`,
    ...report.instructionFiles.map((file) => `  ${file}`),
    `Configuration files: ${report.configurationFiles.length}`,
    ...report.configurationFiles.map((file) => `  ${file}`),
    `Signals: ${report.findings.length}`,
    ...report.findings.map((item) => `  [${item.category}] ${item.file}:${item.line} ${item.signal}`),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const positional = args.filter((arg) => arg !== "--json");
  if (positional.length > 1) {
    console.error("Usage: scan-agent-setup.mjs [project-root] [--json]");
    process.exitCode = 2;
    return;
  }

  const report = await scanProject(positional[0] ?? process.cwd());
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
