import * as lexical from "./reference-analysis-try-catch-lexical.js";
import * as structural from "./reference-analysis-try-catch-structure.js";
function consumeCharacter(content, index, state) {
    const lexicalIndex = lexical.consumeTryCatchLexicalCharacter(content, index, state);
    if (lexicalIndex !== undefined)
        return lexicalIndex;
    return structural.consumeTryCatchStructuralCharacter(content, index, state);
}
export function tryCatchRanges(content) {
    const state = {
        ranges: [],
        stack: [],
        pendingBody: undefined,
        catchParameterDepth: 0,
        quote: "",
        lineComment: false,
        blockComment: false,
    };
    for (let index = 0; index < content.length; index += 1)
        index = consumeCharacter(content, index, state);
    return state.ranges;
}
//# sourceMappingURL=reference-analysis-try-catch-scan.js.map