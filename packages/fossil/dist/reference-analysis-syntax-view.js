function consumeQuote(content, index, state) {
    if (!state.quote)
        return undefined;
    const character = content[index];
    state.characters[index] = " ";
    if (character === "\\") {
        state.characters[index + 1] = " ";
        return index + 1;
    }
    if (character === state.quote)
        state.quote = "";
    return index;
}
function commentContinues(content, index, lineComment) {
    if (index >= content.length)
        return false;
    if (lineComment)
        return content[index] !== "\n";
    return !(content[index] === "*" && content[index + 1] === "/");
}
function commentEnd(content, start, lineComment) {
    let index = start;
    while (commentContinues(content, index, lineComment))
        index += 1;
    return lineComment ? index : Math.min(content.length, index + 2);
}
function maskComment(state, content, start, end) {
    for (let index = start; index < end; index += 1) {
        if (state.characters[index] !== "\n")
            state.characters[index] = " ";
    }
    state.comments.push({ start, end, text: content.slice(start, end) });
}
function consumeCommentStart(content, index, state) {
    const character = content[index];
    const next = content[index + 1];
    if (character !== "/" || !(next === "/" || next === "*"))
        return undefined;
    const lineComment = next === "/";
    const end = commentEnd(content, index + 2, lineComment);
    maskComment(state, content, index, end);
    return end - 1;
}
function consumeQuoteStart(content, index, state) {
    const character = content[index];
    if (!(character === '"' || character === "'" || character === "`"))
        return undefined;
    state.quote = character;
    state.characters[index] = " ";
    return index;
}
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
    for (let index = 0; index < content.length; index += 1) {
        index = consumeSyntaxCharacter(content, index, state);
    }
    return { code: state.characters.join(""), comments: state.comments };
}
//# sourceMappingURL=reference-analysis-syntax-view.js.map