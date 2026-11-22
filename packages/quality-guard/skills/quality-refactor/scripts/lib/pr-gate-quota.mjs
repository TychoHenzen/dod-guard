function requirement({ top, low }) {
  return [top > 0 ? `${top} medium/high` : "", low > 0 ? `${low} low` : ""]
    .filter(Boolean)
    .join(" or ");
}

export function quotaText({ satisfied, available, fixed, required, targets }) {
  if (targets.top === 0 && targets.low === 0) return "Pre-existing quota: off.";
  if (available.top + available.low === 0)
    return "Pre-existing quota: nothing to pay down " + "in the changed files.";
  return (
    `Pre-existing quota ${satisfied ? "met" : "NOT met"}: ` +
    `remove ${requirement(required)} finding(s) that were ` +
    "already in the changed files (removed " +
    `${fixed.top} medium/high and ${fixed.low} low; ` +
    `${available.top} medium/high and ${available.low} low were there).`
  );
}
