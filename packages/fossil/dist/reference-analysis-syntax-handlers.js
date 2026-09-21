function commentContinues(content, index, commentKind) {
    if (index >= content.length)
        return false;
    if (commentKind === "line")
        return content[index] !== "\n";
    return !(content[index] === "*" && content[index + 1] === "/");
}
function commentEnd(content, start, commentKind) {
    let index = start;
    while (commentContinues(content, index, commentKind))
        index += 1;
    return commentKind === "line" ? index : Math.min(content.length, index + 2);
}
function maskComment({ state, content, start, end, }) {
    for (let index = start; index < end; index += 1) {
        if (state.characters[index] !== "\n")
            state.characters[index] = " ";
    }
    state.comments.push({ start, end, text: content.slice(start, end) });
}
export function consumeQuote(content, index, state) {
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
export function consumeCommentStart(content, index, state) {
    const character = content[index];
    const next = content[index + 1];
    if (character !== "/" || !(next === "/" || next === "*"))
        return undefined;
    const commentKind = next === "/" ? "line" : "block";
    const end = commentEnd(content, index + 2, commentKind);
    maskComment({ state, content, start: index, end });
    return end - 1;
}
export function consumeQuoteStart(content, index, state) {
    const character = content[index];
    if (!(character === '"' || character === "'" || character === "`"))
        return undefined;
    state.quote = character;
    state.characters[index] = " ";
    return index;
}
//# sourceMappingURL=reference-analysis-syntax-handlers.js.map