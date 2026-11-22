// Cross-checks the ids an issue body states against the records that must
// agree with them: acceptance-evidence ids against the `## Acceptance criteria`
// checkboxes, and requirement ids against the criteria that cite them. Every
// function is pure and returns remainder lines for the caller to report.
import { acceptanceCriteria, markedLines } from "./acceptance-criteria.mjs";

// A checkbox opens with its criterion id, such as "AC-1" in "- [ ] AC-1 ...".
function criterionLabel(text) {
  return /^[*_`]*([^\s*_`:]+)/.exec(text)?.[1];
}

function checkboxIds(body) {
  return acceptanceCriteria(body)
    .map((criterion) => criterionLabel(criterion.text))
    .filter(Boolean);
}

function acceptanceIdRemainder(body, acceptance) {
  const boxIds = checkboxIds(body);
  if (boxIds.length === 0) return ["Acceptance criteria section has no checkbox"];
  const evidenceIds = acceptance.map((entry) => (typeof entry?.id === "string" ? entry.id.trim() : "")).filter(Boolean);
  return [
    ...boxIds
      .filter((id) => !evidenceIds.includes(id))
      .map((id) => `${id} acceptance criterion has no acceptance-evidence entry`),
    ...evidenceIds
      .filter((id) => !boxIds.includes(id))
      .map((id) => `acceptance-evidence entry ${id} has no Acceptance criteria checkbox`),
  ];
}

// The requirement ids of the requirements record, in order. A repeated id
// stays in the list so that requirementIdRemainder can report it.
function requirementIds(requirements) {
  return markedLines(requirements ?? "")
    .filter((line) => !line.fenced)
    .map((line) => /^\s*[-*] +[*_`]*(R-\d+)(?!\d)/.exec(line.text)?.[1])
    .filter(Boolean);
}

// Whole-token match: "R-1" never matches inside "R-10" or "XR-1".
function citedRequirementIds(text) {
  return [...text.matchAll(/(?<![\w-])R-\d+(?!\d)/g)].map((match) => match[0]);
}

function requirementIdRemainder(body, requirements) {
  const ids = requirementIds(requirements);
  if (ids.length === 0) return ["requirements record has no R-n requirement"];
  const distinct = [...new Set(ids)];
  const criteria = acceptanceCriteria(body);
  const citedPerCriterion = criteria.map((criterion) => [...new Set(citedRequirementIds(criterion.text))]);
  const cited = new Set(citedPerCriterion.flat());
  return [
    ...distinct
      .filter((id) => ids.filter((other) => other === id).length > 1)
      .map((id) => `${id} requirement id is repeated`),
    ...distinct.filter((id) => !cited.has(id)).map((id) => `${id} requirement is cited by no acceptance criterion`),
    ...criteria.flatMap((criterion, index) =>
      citedPerCriterion[index]
        .filter((id) => !ids.includes(id))
        .map((id) => `${criterionLabel(criterion.text)} cites ${id} which is not a requirement`),
    ),
  ];
}

export { acceptanceIdRemainder, requirementIdRemainder };
