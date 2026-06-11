import type { DodDocument, CheckResult } from "./types.js";
export declare function renderMarkdown(doc: DodDocument): string;
export declare function writeMarkdown(doc: DodDocument): Promise<void>;
export declare function updateDocFromCheckResult(doc: DodDocument, result: CheckResult): void;
export declare function formatCheckResult(result: CheckResult): string;
