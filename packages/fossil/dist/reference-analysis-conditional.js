import { balancedClose, hasFallbackToken, hasLeadingFallbackComment, nextNonWhitespace } from "./reference-analysis-fallback-helpers.js";
export function conditionalFallbackRanges(view) {
    const ranges = [];
    const matcher = /\bif\b/g;
    for (let match = matcher.exec(view.code); match; match = matcher.exec(view.code)) {
        const conditionOpen = nextNonWhitespace(view.code, (match.index ?? 0) + match[0].length);
        if (view.code[conditionOpen] !== "(")
            continue;
        const conditionClose = balancedClose(view.code, conditionOpen, "(", ")");
        if (conditionClose === undefined)
            continue;
        const bodyOpen = nextNonWhitespace(view.code, conditionClose + 1);
        if (view.code[bodyOpen] !== "{")
            continue;
        const bodyClose = balancedClose(view.code, bodyOpen, "{", "}");
        if (bodyClose === undefined)
            continue;
        const fallbackIf = hasFallbackToken(view.code.slice(conditionOpen + 1, conditionClose)) ||
            hasLeadingFallbackComment(view, match.index ?? 0);
        if (fallbackIf)
            ranges.push([bodyOpen, bodyClose]);
        const elseStart = nextNonWhitespace(view.code, bodyClose + 1);
        if (view.code.slice(elseStart, elseStart + 4) !== "else")
            continue;
        const elseBodyOpen = nextNonWhitespace(view.code, elseStart + 4);
        if (view.code[elseBodyOpen] !== "{")
            continue;
        const elseBodyClose = balancedClose(view.code, elseBodyOpen, "{", "}");
        if (elseBodyClose !== undefined && (fallbackIf || hasLeadingFallbackComment(view, elseStart)))
            ranges.push([elseBodyOpen, elseBodyClose]);
    }
    return ranges;
}
//# sourceMappingURL=reference-analysis-conditional.js.map