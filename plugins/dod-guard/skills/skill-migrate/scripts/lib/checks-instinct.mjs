// An instinct file uses a flat id/trigger/confidence/domain schema instead
// of the memory kind's name/description/metadata.type schema, so it gets
// its own frontmatter check rather than reusing memory-frontmatter.

function confidenceRangeProblem(raw, num) {
  if (num < 0 || num > 1) return `confidence "${raw}" not in range 0 to 1`;
  return null;
}

function confidenceProblem(raw) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "confidence missing";
  const num = Number(trimmed);
  if (Number.isNaN(num)) return `confidence "${raw}" is not a number`;
  return confidenceRangeProblem(raw, num);
}

function missingInstinctField(value, name) {
  return (value ?? "").trim() ? null : `missing ${name}`;
}

function instinctFrontmatterProblem(fm) {
  const nameProblem = missingInstinctField(fm.id, "id") ?? missingInstinctField(fm.trigger, "trigger");
  if (nameProblem) return nameProblem;
  const confProblem = confidenceProblem(fm.confidence);
  if (confProblem) return confProblem;
  return missingInstinctField(fm.domain, "domain");
}

export function checkInstinctFrontmatter(fm) {
  const problem = instinctFrontmatterProblem(fm);
  return {
    id: "instinct-frontmatter",
    label: "Frontmatter: id, trigger, confidence 0-1, domain",
    value: problem ?? "ok",
    pass: !problem,
    detail: problem ?? "valid",
  };
}
