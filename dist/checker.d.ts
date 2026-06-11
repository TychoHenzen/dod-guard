import type { DodDocument, CheckResult } from "./types.js";
export declare function checkDocument(doc: DodDocument, cwdOverride?: string): Promise<CheckResult>;
