import { nextNonWhitespace } from "./reference-analysis-fallback-helpers.js";
export function fallbackOperandRanges(code) {
    const ranges = [];
    const matcher = /\|\||\?\?/g;
    for (let match = matcher.exec(code); match; match = matcher.exec(code)) {
        const start = nextNonWhitespace(code, (match.index ?? 0) + match[0].length);
        let parentheses = 0;
        let brackets = 0;
        let braces = 0;
        let end = start;
        for (; end < code.length; end += 1) {
            const character = code[end];
            if (character === "(")
                parentheses += 1;
            else if (character === ")" && parentheses-- === 0)
                break;
            else if (character === "[")
                brackets += 1;
            else if (character === "]" && brackets-- === 0)
                break;
            else if (character === "{")
                braces += 1;
            else if (character === "}" && braces-- === 0)
                break;
            else if (parentheses === 0 &&
                brackets === 0 &&
                braces === 0 &&
                (character === ";" || character === "," || character === "\n"))
                break;
        }
        if (end > start)
            ranges.push([start - 1, end]);
    }
    return ranges;
}
//# sourceMappingURL=reference-analysis-fallback-operands.js.map