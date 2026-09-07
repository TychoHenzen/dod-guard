import type { z } from "zod";
import { evidenceSchema } from "./adapter-selection-evidence-schema.js";

export type AdapterSelectionEvidence = z.infer<typeof evidenceSchema>;
