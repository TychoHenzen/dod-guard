import { consumeCommentStart, consumeQuote, consumeQuoteStart, } from "./reference-analysis-syntax-handlers.js";
const SYNTAX_HANDLERS = [
    consumeQuote,
    consumeCommentStart,
    consumeQuoteStart,
];
function consumeSyntaxCharacter(content, index, state) {
    for (const handler of SYNTAX_HANDLERS) {
        const nextIndex = handler(content, index, state);
        if (nextIndex !== undefined)
            return nextIndex;
    }
    return index;
}
export function syntaxView(content) {
    const state = {
        characters: content.split(""),
        comments: [],
        quote: "",
    };
    for (let index = 0; index < content.length; index += 1)
        index = consumeSyntaxCharacter(content, index, state);
    return { code: state.characters.join(""), comments: state.comments };
}
//# sourceMappingURL=reference-analysis-syntax-view.js.map