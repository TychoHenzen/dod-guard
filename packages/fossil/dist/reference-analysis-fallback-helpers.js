export function hasFallbackToken(text) {
    return /\b(?:fallback|legacy|old|default)\b/i.test(text);
}
export function balancedClose(code, open, opening, closing) {
    let depth = 0;
    for (let index = open; index < code.length; index += 1) {
        if (code[index] === opening)
            depth += 1;
        if (code[index] === closing && --depth === 0)
            return index;
    }
    return undefined;
}
export function nextNonWhitespace(code, start) {
    let index = start;
    while (/\s/.test(code[index] ?? ""))
        index += 1;
    return index;
}
export function hasLeadingFallbackComment(view, position) {
    return view.comments.some((comment) => comment.end <= position && /^\s*$/.test(view.code.slice(comment.end, position)) && hasFallbackToken(comment.text));
}
//# sourceMappingURL=reference-analysis-fallback-helpers.js.map