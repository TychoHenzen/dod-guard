export interface TryCatchState {
  ranges: [number, number][];
  stack: { kind: boolean; start: number }[];
  pendingBody: "try" | "catch" | undefined;
  catchParameterDepth: number;
  quote: string;
  lineComment: boolean;
  blockComment: boolean;
}
