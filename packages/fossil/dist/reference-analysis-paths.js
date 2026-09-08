import { posix } from "node:path";
const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
export function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
export function sourceSpan(content, start, end) {
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    return {
        start,
        end,
        line: content.slice(0, start).split("\n").length,
        column: start - lineStart + 1,
    };
}
export function targetCandidates(sourcePath, specifier) {
    if (!(specifier.startsWith("./") || specifier.startsWith("../")))
        return [specifier];
    const literal = posix.normalize(posix.join(posix.dirname(sourcePath), specifier));
    return [
        literal,
        ...MODULE_EXTENSIONS.map((extension) => `${literal}${extension}`),
        ...MODULE_EXTENSIONS.map((extension) => `${literal}/index${extension}`),
    ];
}
export function normalizedPath(path) {
    return posix.normalize(path.replaceAll("\\", "/"));
}
export function pathIsWithin(root, candidate) {
    const normalizedRoot = normalizedPath(root).replace(/\/$/, "");
    const normalizedCandidate = normalizedPath(candidate);
    const compareRoot = /^[A-Za-z]:\//.test(normalizedRoot) ? normalizedRoot.toLowerCase() : normalizedRoot;
    const compareCandidate = /^[A-Za-z]:\//.test(normalizedCandidate)
        ? normalizedCandidate.toLowerCase()
        : normalizedCandidate;
    return compareCandidate === compareRoot || compareCandidate.startsWith(`${compareRoot}/`);
}
export function isOutsideRepositoryPath(path) {
    const normalized = normalizedPath(path);
    return (normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized));
}
export function outsideBoundaryWarning(sourcePath) {
    return {
        code: "reference_outside_boundary",
        message: "Relative reference target is outside the repository boundary.",
        path: sourcePath,
    };
}
//# sourceMappingURL=reference-analysis-paths.js.map