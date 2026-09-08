import { balancedClose, hasFallbackToken, hasLeadingFallbackComment, nextNonWhitespace } from "./reference-analysis-fallback-helpers.js";
function conditionalBody(view, matchIndex) {
    const conditionOpen = nextNonWhitespace(view.code, matchIndex);
    if (view.code[conditionOpen] !== "(")
        return undefined;
    const conditionClose = balancedClose(view.code, conditionOpen, "(", ")");
    if (conditionClose === undefined)
        return undefined;
    const bodyOpen = nextNonWhitespace(view.code, conditionClose + 1);
    if (view.code[bodyOpen] !== "{")
        return undefined;
    const bodyClose = balancedClose(view.code, bodyOpen, "{", "}");
    if (bodyClose === undefined)
        return undefined;
    return { conditionOpen, conditionClose, bodyOpen, bodyClose };
}
function hasConditionalFallback(view, matchIndex, conditionOpen, conditionClose) {
    if (hasFallbackToken(view.code.slice(conditionOpen + 1, conditionClose)))
        return true;
    return hasLeadingFallbackComment(view, matchIndex);
}
function hasFallbackElse(view, fallbackIf, elseStart) {
    if (fallbackIf)
        return true;
    return hasLeadingFallbackComment(view, elseStart);
}
function elseBody(view, bodyClose, fallbackIf) {
    const elseStart = nextNonWhitespace(view.code, bodyClose + 1);
    if (view.code.slice(elseStart, elseStart + 4) !== "else")
        return undefined;
    const elseBodyOpen = nextNonWhitespace(view.code, elseStart + 4);
    if (view.code[elseBodyOpen] !== "{")
        return undefined;
    const elseBodyClose = balancedClose(view.code, elseBodyOpen, "{", "}");
    if (elseBodyClose === undefined)
        return undefined;
    if (!hasFallbackElse(view, fallbackIf, elseStart))
        return undefined;
    return [elseBodyOpen, elseBodyClose];
}
function conditionalRanges(view, matchIndex) {
    const body = conditionalBody(view, matchIndex + 2);
    if (!body)
        return [];
    const fallbackIf = hasConditionalFallback(view, matchIndex, body.conditionOpen, body.conditionClose);
    const ranges = [];
    if (fallbackIf)
        ranges.push([body.bodyOpen, body.bodyClose]);
    const fallbackElse = elseBody(view, body.bodyClose, fallbackIf);
    if (fallbackElse)
        ranges.push(fallbackElse);
    return ranges;
}
export function conditionalFallbackRanges(view) {
    const ranges = [];
    const matcher = /\bif\b/g;
    for (let match = matcher.exec(view.code); match; match = matcher.exec(view.code)) {
        ranges.push(...conditionalRanges(view, match.index ?? 0));
    }
    return ranges;
}
//# sourceMappingURL=reference-analysis-conditional.js.map