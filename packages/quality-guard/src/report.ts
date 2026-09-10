import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { parseQualityConfig } from "./commit-gate/config.js";
import * as currentArchitecture from "./commit-gate/current-architecture.js";
import { extractFactInventory } from "./commit-gate/facts.js";
import { buildQualityReport } from "./report-builder.js";
import { runScan, type ScanRequest } from "./scanner.js";

const analyzeArchitecture = currentArchitecture.analyzeCurrentArchitecture;

function architectureFor(
  root: string,
  scan: Parameters<typeof buildQualityReport>[0],
) {
  const configPath = path.join(root, ".quality-guard.json");
  const config = parseQualityConfig(
    existsSync(configPath) ? readFileSync(configPath, "utf8") : "{}",
  );
  const sourceFiles = scan.files.map((file) => ({
    path: file.path,
    content: readFileSync(path.join(root, file.path), "utf8"),
  }));
  const inventory = extractFactInventory(
    sourceFiles,
    sourceFiles.map((file) => file.path),
  );
  const analyzed = analyzeArchitecture(inventory.files, config);
  return {
    ...analyzed,
    errors: inventory.errors.map((message) => {
      const separator = message.indexOf(": ");
      return {
        code: "ARCHITECTURE_EXTRACTION_FAILED",
        target: separator === -1 ? "" : message.slice(0, separator),
        message: separator === -1 ? message : message.slice(separator + 2),
      };
    }),
  };
}

function asReportScan(
  report: unknown,
): Parameters<typeof buildQualityReport>[0] {
  const candidate = report as Partial<Parameters<typeof buildQualityReport>[0]>;
  if (
    !(
      Array.isArray(candidate.files) &&
      Array.isArray(candidate.violations) &&
      candidate.profile
    )
  ) {
    throw new Error("quality scanner returned an invalid report");
  }
  return candidate as Parameters<typeof buildQualityReport>[0];
}

export function runQualityReport(
  request: Omit<ScanRequest, "paths"> & { root?: string },
) {
  const root = path.resolve(request.root ?? process.cwd());
  const scan = asReportScan(runScan({ ...request, root, paths: ["."] }).report);
  return buildQualityReport(scan, architectureFor(root, scan));
}
