#!/usr/bin/env node
// Report high and critical production dependency advisories without a gate.

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { npmCommand } from "./npm-command.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADVISORY_LEVELS = new Set(["high", "critical"]);

function runAudit() {
  const command = npmCommand(["audit", "--json", "--omit=dev"]);
  try {
    return JSON.parse(
      execFileSync(command.command, command.args, {
        cwd: ROOT,
        encoding: "utf8",
        shell: command.shell,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

function advisories(report) {
  const found = new Map();
  for (const entry of Object.values(report.vulnerabilities ?? {})) {
    if (!ADVISORY_LEVELS.has(entry.severity)) continue;
    for (const via of entry.via) {
      if (typeof via !== "object" || via.source === undefined) continue;
      found.set(String(via.source), {
        id: String(via.source),
        package: via.name,
        severity: via.severity,
        title: via.title,
      });
    }
  }
  return [...found.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function main(argv, dependencies = {}) {
  if (argv.length > 0) {
    (dependencies.stderr ?? process.stderr).write(`unknown option: ${argv[0]}\nusage: check-audit.mjs\n`);
    return 3;
  }

  const stdout = dependencies.stdout ?? process.stdout;
  try {
    const current = dependencies.advisories ? dependencies.advisories() : advisories(runAudit());
    stdout.write(`audit advisory — ${current.length} high/critical production advisory(ies)\n`);
    for (const item of current) {
      stdout.write(`  ${item.severity} ${item.package}: ${item.title} (advisory ${item.id})\n`);
    }
  } catch (error) {
    stdout.write(`audit advisory unavailable — ${error instanceof Error ? error.message : String(error)}\n`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
