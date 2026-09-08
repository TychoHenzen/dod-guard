import { consumeTryCatchLexicalCharacter } from "./reference-analysis-try-catch-lexical.js";
import { consumeTryCatchStructuralCharacter } from "./reference-analysis-try-catch-structure.js";
function consumeCharacter(content, index, state) {
    const lexicalIndex = consumeTryCatchLexicalCharacter(content, index, state);
    if (lexicalIndex !== undefined)
        return lexicalIndex;
    return consumeTryCatchStructuralCharacter(content, index, state);
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