function normalizeCandidatePath(path) {
    return path
        .replaceAll("\\", "/")
        .replace(/\/(?:index)(?:\.[^/]+)?$/, "")
        .replace(/\.[^/]+$/, "");
}
function basename(path) {
    return normalizeCandidatePath(path).split("/").at(-1) ?? "";
}
export function candidateBasenameCounts(candidates) {
    const counts = new Map();
    for (const path of candidates) {
        const name = basename(path);
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
}
function matchesFullPath(normalizedTarget, normalizedCandidate) {
    return normalizedCandidate === normalizedTarget || normalizedCandidate.endsWith(`/${normalizedTarget}`);
}
function matchesBasename(normalizedTarget, normalizedCandidate, basenameCounts) {
    const name = normalizedTarget.split("/").at(-1) ?? "";
    return normalizedCandidate === normalizedTarget ||
        (basenameCounts.get(name) === 1 && normalizedCandidate.endsWith(`/${name}`));
}
function matchesCandidate(normalizedTarget, candidate, basenameCounts) {
    if (!normalizedTarget)
        return false;
    const normalizedCandidate = normalizeCandidatePath(candidate);
    if (normalizedTarget.includes("/"))
        return matchesFullPath(normalizedTarget, normalizedCandidate);
    return matchesBasename(normalizedTarget, normalizedCandidate, basenameCounts);
}
function markUnresolvedTarget({ target, candidates, basenameCounts, unavailable }) {
    const normalizedTarget = normalizeCandidatePath(target);
    if (!normalizedTarget)
        return;
    for (const candidate of candidates) {
        if (matchesCandidate(normalizedTarget, candidate, basenameCounts))
            unavailable.add(candidate);
    }
}
export function markUnresolvedReference({ unresolved, candidates, basenameCounts, unavailable }) {
    if (unresolved.resolution !== "unresolved")
        return;
    for (const target of unresolved.targetCandidates)
        markUnresolvedTarget({ target, candidates, basenameCounts, unavailable });
}
//# sourceMappingURL=reference-analysis-candidate-matching.js.map