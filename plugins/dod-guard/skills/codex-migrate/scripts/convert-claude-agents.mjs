#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MODEL_MAP = new Map([
  ["haiku", "gpt-5.6-luna"],
  ["sonnet", "gpt-5.6-terra"],
  ["opus", "gpt-5.6-sol"],
]);

function parseFrontmatter(text, file) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0] !== "---") throw new Error(`Missing frontmatter: ${file}`);
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new Error(`Unclosed frontmatter: ${file}`);

  const values = {};
  for (let index = 1; index < end; index += 1) {
    const match = lines[index].match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
    if (!match) continue;
    const [, key, raw = ""] = match;
    if ([">", ">-", "|", "|-"].includes(raw)) {
      const folded = [];
      while (index + 1 < end && /^\s+/.test(lines[index + 1])) {
        index += 1;
        folded.push(lines[index].trim());
      }
      values[key] = raw.startsWith(">") ? folded.join(" ") : folded.join("\n");
    } else {
      values[key] = raw.trim().replace(/^(["'])(.*)\1$/, "$2");
    }
  }

  const body = `${lines.slice(end + 1).join("\n").trim()}\n`;
  return { values, body };
}

function tomlString(value) {
  return JSON.stringify(value);
}

function codexName(name) {
  return `dod_guard_${name.replaceAll("-", "_")}`;
}

function renderAgent(sourceName, parsed) {
  const { values, body } = parsed;
  for (const field of ["name", "description", "model", "tools"]) {
    if (!values[field]) throw new Error(`Missing ${field}: ${sourceName}`);
  }

  const model = MODEL_MAP.get(values.model);
  if (!model) throw new Error(`Unknown Claude model tier '${values.model}': ${sourceName}`);
  if (body.includes("'''")) throw new Error(`Agent body contains unsupported TOML delimiter: ${sourceName}`);

  const writes = /(?:^|,\s*)(?:Write|Edit)(?:,|$)/.test(values.tools);
  const hasShell = /(?:^|,\s*)Bash(?:,|$)/.test(values.tools);
  const effort = values.effort || "medium";
  const turnInstruction = values.maxTurns
    ? `Source compatibility: finish within ${values.maxTurns} agent turns.\n\n`
    : "";
  const shellInstruction = hasShell ? "" : "Do not run shell commands.\n\n";

  return [
    `# Generated from agents/${sourceName}. Do not edit by hand.`,
    `# Source tools: ${values.tools}`,
    `name = ${tomlString(codexName(values.name))}`,
    `description = ${tomlString(values.description)}`,
    `model = ${tomlString(model)}`,
    `model_reasoning_effort = ${tomlString(effort)}`,
    `sandbox_mode = ${tomlString(writes ? "workspace-write" : "read-only")}`,
    "developer_instructions = '''",
    `${turnInstruction}${shellInstruction}${body.trimEnd()}`,
    "'''",
    "",
  ].join("\n");
}

export async function buildAgentOutputs(sourceDirectory) {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const outputs = new Map();

  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".md")).sort((a, b) => a.name.localeCompare(b.name))) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const parsed = parseFrontmatter(await readFile(sourcePath, "utf8"), sourcePath);
    const outputName = `${codexName(parsed.values.name)}.toml`;
    if (outputs.has(outputName)) throw new Error(`Duplicate Codex agent name: ${outputName}`);
    outputs.set(outputName, renderAgent(entry.name, parsed));
  }

  return outputs;
}

export async function writeAgentOutputs(sourceDirectory, outputDirectory) {
  const outputs = await buildAgentOutputs(sourceDirectory);
  await mkdir(outputDirectory, { recursive: true });
  for (const [name, content] of outputs) {
    await writeFile(path.join(outputDirectory, name), content, "utf8");
  }
  return outputs.size;
}

export async function checkAgentOutputs(sourceDirectory, outputDirectory) {
  const expected = await buildAgentOutputs(sourceDirectory);
  let entries = [];
  try {
    entries = await readdir(outputDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const actualNames = new Set(entries
    .filter((entry) => entry.isFile() && entry.name.startsWith("dod_guard_") && entry.name.endsWith(".toml"))
    .map((entry) => entry.name));
  const findings = [];

  for (const [name, content] of expected) {
    if (!actualNames.has(name)) {
      findings.push(`missing ${name}`);
      continue;
    }
    const actual = await readFile(path.join(outputDirectory, name), "utf8");
    if (actual !== content) findings.push(`stale ${name}`);
  }

  for (const name of actualNames) {
    if (!expected.has(name)) findings.push(`unexpected ${name}`);
  }

  return findings.sort();
}

function parseArguments(args) {
  const options = { source: "agents", output: path.join(".codex", "agents"), check: false };
  for (const argument of args) {
    if (argument === "--check") options.check = true;
    else if (argument.startsWith("--source=")) options.source = argument.slice("--source=".length);
    else if (argument.startsWith("--output=")) options.output = argument.slice("--output=".length);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const source = path.resolve(options.source);
  const output = path.resolve(options.output);
  if (options.check) {
    const findings = await checkAgentOutputs(source, output);
    if (findings.length > 0) {
      console.error(findings.join("\n"));
      process.exitCode = 1;
      return;
    }
    console.log(`Codex agents current: ${output}`);
    return;
  }

  const count = await writeAgentOutputs(source, output);
  console.log(`Generated ${count} Codex agents in ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
