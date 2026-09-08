import { balancedClose, nextNonWhitespace, } from "./reference-analysis-fallback-helpers.js";
function matchIndex(match) {
    return match.index ?? 0;
}
function rustAttributeItem(view, attributeStart) {
    const conditionOpen = view.code.indexOf("(", attributeStart);
    const conditionClose = balancedClose({
        code: view.code,
        open: conditionOpen,
        opening: "(",
        closing: ")",
    });
    if (conditionClose === undefined)
        return undefined;
    const attributeEnd = nextNonWhitespace(view.code, conditionClose + 1);
    if (view.code[attributeEnd] !== "]")
        return undefined;
    const itemStart = nextNonWhitespace(view.code, attributeEnd + 1);
    let delimiter = itemStart;
    while (delimiter < view.code.length &&
        view.code[delimiter] !== "{" &&
        view.code[delimiter] !== ";")
        delimiter += 1;
    return { itemStart, delimiter };
}
function rustBlockEnd(view, item) {
    if (view.code[item.delimiter] !== "{")
        return undefined;
    return balancedClose({
        code: view.code,
        open: item.delimiter,
        opening: "{",
        closing: "}",
    });
}
function rustGuardRange(view, match) {
    const item = rustAttributeItem(view, matchIndex(match));
    if (!item)
        return undefined;
    const itemEnd = rustBlockEnd(view, item);
    if (itemEnd !== undefined)
        return { start: item.itemStart, end: itemEnd };
    if (view.code[item.delimiter] === ";")
        return { start: item.itemStart, end: item.delimiter };
    return undefined;
}
export function rustGuardRanges(view) {
    const ranges = [];
    const attributes = /#\s*\[\s*cfg\s*\(/g;
    for (let match = attributes.exec(view.code); match; match = attributes.exec(view.code)) {
        const range = rustGuardRange(view, match);
        if (range)
            ranges.push(range);
    }
    return ranges;
}
//# sourceMappingURL=reference-analysis-rust-guards.js.map