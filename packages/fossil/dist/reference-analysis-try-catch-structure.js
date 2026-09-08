function isTryCatchBlock(state) {
    if (state.pendingBody === "try")
        return true;
    return state.pendingBody === "catch" && state.catchParameterDepth === 0;
}
function consumeBrace(content, index, state) {
    if (content[index] === "{") {
        const kind = isTryCatchBlock(state);
        state.stack.push({ kind, start: index });
        if (kind)
            state.pendingBody = undefined;
        return index;
    }
    if (content[index] !== "}")
        return undefined;
    const opened = state.stack.pop();
    if (opened?.kind)
        state.ranges.push({ start: opened.start, end: index });
    return index;
}
export function consumeTryCatchStructuralCharacter(content, index, state) {
    return consumeBrace(content, index, state) ?? index;
}
//# sourceMappingURL=reference-analysis-try-catch-structure.js.map