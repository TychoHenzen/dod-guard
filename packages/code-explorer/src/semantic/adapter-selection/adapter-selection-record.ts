import type { z } from "zod";
import { recordSchema } from "./adapter-selection-record-schema.js";

export type AdapterSelectionRecord = z.infer<typeof recordSchema>;
