import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
export declare function hasFallbackToken(text: string): boolean;
export declare function balancedClose({ code, open, opening, closing }: {
    code: string;
    open: number;
    opening: string;
    closing: string;
}): number | undefined;
export declare function nextNonWhitespace(code: string, start: number): number;
export declare function hasLeadingFallbackComment(view: SyntaxView, position: number): boolean;
