import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evidenceAligns } from "./adapter-selection-evidence-check.js";
import {
  parseAdapterSelectionEvidence,
  parseAdapterSelectionRecord,
} from "./adapter-selection-parser.js";
import type { AdapterSelectionRecord } from "./adapter-selection-record.js";
import { findPackageRoot } from "./adapter-selection-root.js";

export function loadAdapterSelectionRecord(): AdapterSelectionRecord {
  const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
  const record = parseFile(
    join(packageRoot, "adapter-selection.json"),
    parseAdapterSelectionRecord,
    "invalid adapter selection record",
  );
  const evidence = parseFile(
    join(packageRoot, record.evidence_artifact),
    parseAdapterSelectionEvidence,
    "invalid adapter selection evidence",
  );
  if (!evidenceAligns(record, evidence))
    throw new Error("invalid adapter selection evidence");
  return record;
}

function parseFile<T>(
  path: string,
  parse: (input: unknown) => T,
  errorMessage: string,
): T {
  try {
    return parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    throw new Error(errorMessage);
  }
}
