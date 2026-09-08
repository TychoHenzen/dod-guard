import type { TryCatchState } from "./reference-analysis-try-catch-state.js";
export declare function consumeLineComment(content: string, index: number, state: TryCatchState): number | undefined;
export declare function consumeBlockComment(content: string, index: number, state: TryCatchState): number | undefined;
export declare function startComment(content: string, index: number, state: TryCatchState): number | undefined;
export declare function startQuote(content: string, index: number, state: TryCatchState): number | undefined;
