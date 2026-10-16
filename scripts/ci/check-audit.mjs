#!/usr/bin/env node
// Report critical, high, and moderate production dependency advisories without a gate.
// The report goes to stdout and, when GITHUB_STEP_SUMMARY is set, to the CI step summary.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { npmCommand } from "./npm-command.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Order is the report order, most severe first.
const REPORTED_LEVELS = ["critical", "high", "moderate"];

// A failed npm audit prints an error object (an `error` key, no `vulnerabilities`).
// Treating that as a report would show 0 advisories, so it is thrown as unavailable instead.
export function parseAuditReport(text) {
  const report = JSON.parse(text);
  if (report?.error) {
    const detail = report.error.summary ?? report.error.code ?? "npm audit returned an error";
    throw new Error(String(detail));
  }
  if (typeof report?.vulnerabilities !== "object" || report.vulnerabilities === null) {
    throw new Error("npm audit report has no vulnerabilities object");
  }
  return report;
}

function readAuditOutput(exec) {
  const command = npmCommand(["audit", "--json", "--omit=dev"]);
  try {
    return exec(command.command, command.args, {
      cwd: ROOT,
      encoding: "utf8",
      shell: command.shell,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // npm audit exits non-zero when it finds advisories but still prints the report on stdout.
    if (error.stdout) return error.stdout;
    throw error;
  }
}

export function runAudit(exec = execFileSync) {
  return parseAuditReport(readAuditOutput(exec));
}

export function fixHint(fixAvailable) {
  if (typeof fixAvailable === "object" && fixAvailable !== null && fixAvailable.name && fixAvailable.version) {
    return `fix: ${fixAvailable.name}@${fixAvailable.version}`;
  }
  if (fixAvailable === true) return "fix: npm audit fix";
  return "no fix available";
}

function isReportedAdvisory(via) {
  return typeof via === "object" && via !== null && via.source !== undefined && REPORTED_LEVELS.includes(via.severity);
}

function bySeverityThenId(left, right) {
  return (
    REPORTED_LEVELS.indexOf(left.severity) - REPORTED_LEVELS.indexOf(right.severity) || left.id.localeCompare(right.id)
  );
}

function byPackageName([left], [right]) {
  return left.localeCompare(right);
}

export function advisories(report) {
  const found = new Map();
  for (const [, entry] of Object.entries(report.vulnerabilities ?? {}).sort(byPackageName)) {
    for (const via of entry.via ?? []) {
      if (!isReportedAdvisory(via)) continue;
      const id = String(via.source);
      found.set(id, {
        id,
        package: via.name,
        severity: via.severity,
        title: via.title,
        range: via.range,
        fix: fixHint(entry.fixAvailable),
      });
    }
  }
  return [...found.values()].sort(bySeverityThenId);
}

function formatItem(item) {
  return `  ${item.package}: ${item.title} (advisory ${item.id}, affected ${item.range ?? "unknown"}, ${item.fix})`;
}

function formatGroup(current, level) {
  const group = current.filter((item) => item.severity === level);
  if (group.length === 0) return [];
  return [`${level} (${group.length}):`, ...group.map(formatItem)];
}

export function formatReport(current) {
  const count = (level) => current.filter((item) => item.severity === level).length;
  const headline =
    `audit advisory - ${current.length} production advisory(ies): ` +
    `${count("critical")} critical, ${count("high")} high, ${count("moderate")} moderate`;
  return [headline, ...REPORTED_LEVELS.flatMap((level) => formatGroup(current, level))];
}

export function formatUnavailable(error) {
  return `audit advisory unavailable - ${error instanceof Error ? error.message : String(error)}`;
}

export function writeSummary(lines, summaryPath, append) {
  if (!summaryPath) return;
  append(summaryPath, `### Dependency audit (report only)\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
}

function reportLines(dependencies) {
  try {
    const current = dependencies.advisories ? dependencies.advisories() : advisories(runAudit(dependencies.exec));
    return formatReport(current);
  } catch (error) {
    return [formatUnavailable(error)];
  }
}

function emitReport(lines, dependencies) {
  const stdout = dependencies.stdout ?? process.stdout;
  for (const line of lines) stdout.write(`${line}\n`);
  try {
    writeSummary(
      lines,
      dependencies.summaryPath ?? process.env.GITHUB_STEP_SUMMARY,
      dependencies.appendFile ?? appendFileSync,
    );
  } catch (error) {
    stdout.write(`audit summary not written - ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

export function main(argv, dependencies = {}) {
  if (argv.length > 0) {
    (dependencies.stderr ?? process.stderr).write(`unknown option: ${argv[0]}\nusage: check-audit.mjs\n`);
    return 3;
  }
  emitReport(reportLines(dependencies), dependencies);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
