import type { OutputCapture } from "./types/output-capture.js";
/** Captures output through injected writers without replacing process streams. */
export declare function createOutputCapture(): OutputCapture;
