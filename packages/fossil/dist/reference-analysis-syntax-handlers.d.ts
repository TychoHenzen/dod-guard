export interface SyntaxState {
    characters: string[];
    comments: {
        start: number;
        end: number;
        text: string;
    }[];
    quote: string;
}
export declare function consumeQuote(content: string, index: number, state: SyntaxState): number | undefined;
export declare function consumeCommentStart(content: string, index: number, state: SyntaxState): number | undefined;
export declare function consumeQuoteStart(content: string, index: number, state: SyntaxState): number | undefined;
