import type { ReferenceRange } from "./reference-analysis-types.js";

export interface TryCatchState {
  ranges: ReferenceRange[];
  stack: { kind: boolean; start: number }[];
  pendingBody: "try" | "catch" | undefined;
  catchParameterDepth: number;
  quote: string;
  lineComment: boolean;
  blockComment: boolean;
}
