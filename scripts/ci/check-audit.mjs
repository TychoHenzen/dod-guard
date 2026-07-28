#!/usr/bin/env node
// check-audit — ratchet on high/critical advisories in published dependencies.
//
// A plain `npm audit --audit-level=high` gate breaks unrelated builds the day a
// new CVE lands, so it gets disabled and stops meaning anything. This records
// the advisories already known and fails only on NEW ones. Dev dependencies are
// reported but never block: they never reach a user's machine.
//
// Usage: node scripts/ci/check-audit.mjs [--write-baseline]
//
// Exit codes:
//   0  no new high/critical advisories in production dependencies
//   1  new advisories
//   3  usage error

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = join(ROOT, ".github", "quality", "audit-baseline.json");
const BLOCKING = new Set(["high", "critical"]);

function runAudit(omitDev) {
  const args = ["audit", "--json", ...(omitDev ? ["--omit=dev"] : [])];
  try {
    // npm audit exits non-zero when vulnerabilities exist; the JSON is still on stdout.
    return JSON.parse(
      execFileSync("npm", args, {
        cwd: ROOT,
        encoding: "utf8",
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch (err) {
    if (err.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

function advisories(report) {
  const found = new Map();
  for (const entry of Object.values(report.vulnerabilities ?? {})) {
    if (!BLOCKING.has(entry.severity)) continue;
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
  return found;
}

function main(argv) {
  const unknown = argv.filter((a) => a !== "--write-baseline");
  if (unknown.length > 0) {
    process.stderr.write(`unknown option: ${unknown[0]}\nusage: check-audit.mjs [--write-baseline]\n`);
    return 3;
  }

  const current = advisories(runAudit(true));
  if (argv.includes("--write-baseline")) {
    const known = [...current.values()].sort((a, b) => a.id.localeCompare(b.id));
    writeFileSync(
      BASELINE,
      `${JSON.stringify({ note: "Known high/critical advisories in production dependencies. New ones fail CI.", known }, null, 2)}\n`,
    );
    process.stdout.write(`wrote audit baseline with ${known.length} known advisory(ies)\n`);
    return 0;
  }

  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : { known: [] };
  const allowed = new Set(baseline.known.map((a) => String(a.id)));
  const added = [...current.values()].filter((a) => !allowed.has(a.id));
  const fixed = baseline.known.filter((a) => !current.has(String(a.id)));

  const devReport = runAudit(false).metadata?.vulnerabilities ?? {};
  process.stdout.write(`all dependencies (dev included): ${JSON.stringify(devReport)}\n`);
  for (const advisory of fixed)
    process.stdout.write(
      `  fixed: ${advisory.package} (${advisory.id}) no longer vulnerable — rerun with --write-baseline\n`,
    );

  if (added.length === 0) {
    process.stdout.write(`audit OK — ${current.size} known high/critical advisory(ies) in production deps, 0 new\n`);
    return 0;
  }
  process.stdout.write(`audit FAILED — ${added.length} new high/critical advisory(ies) in production deps\n\n`);
  for (const advisory of added)
    process.stdout.write(`  ${advisory.severity} ${advisory.package}: ${advisory.title} (advisory ${advisory.id})\n`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
