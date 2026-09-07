import type { AdapterSelectionEvidence } from "./adapter-selection-evidence.js";
import { evidenceSchema } from "./adapter-selection-evidence-schema.js";
import type { AdapterSelectionRecord } from "./adapter-selection-record.js";
import { recordSchema } from "./adapter-selection-record-schema.js";
import { deepFreeze } from "./adapter-selection-root.js";

export function parseAdapterSelectionEvidence(
  input: unknown,
): AdapterSelectionEvidence {
  const parsed = evidenceSchema.safeParse(input);
  if (!parsed.success) throw new Error("invalid adapter selection evidence");
  return deepFreeze(parsed.data);
}

export function parseAdapterSelectionRecord(
  input: unknown,
): AdapterSelectionRecord {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) throw new Error("invalid adapter selection record");
  return deepFreeze(parsed.data);
}
