function isQuote(character) {
    return character === '"' || character === "'" || character === "`";
}
export function consumeLineComment(content, index, state) {
    if (!state.lineComment)
        return undefined;
    if (content[index] === "\n")
        state.lineComment = false;
    return index;
}
export function consumeBlockComment(content, index, state) {
    if (!state.blockComment)
        return undefined;
    if (content[index] === "*" && content[index + 1] === "/") {
        state.blockComment = false;
        return index + 1;
    }
    return index;
}
export function startComment(content, index, state) {
    const character = content[index];
    const next = content[index + 1];
    if (character !== "/" || (next !== "/" && next !== "*"))
        return undefined;
    state.lineComment = next === "/";
    state.blockComment = next === "*";
    return index + 1;
}
export function startQuote(content, index, state) {
    const character = content[index];
    if (!isQuote(character))
        return undefined;
    state.quote = character;
    return index;
}
//# sourceMappingURL=reference-analysis-try-catch-handlers.js.map