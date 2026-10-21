import { groupProblems } from "./merge-groups.mjs";
import { rulingProblems } from "./scanner-rulings.mjs";

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Severity comes only from the build, so a severity key anywhere in the output
// is refused rather than ignored: ignoring it would hide a pass that tried.
function severityPaths(value, path) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => severityPaths(item, `${path}[${index}]`));
  }
  if (!isObject(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, item]) => {
    const here = `${path}.${key}`;
    return [...(key === "severity" ? [here] : []), ...severityPaths(item, here)];
  });
}

// Each check returns its own problem list, so one refusal names them all.
function mergeProblems(output, candidates) {
  if (!isObject(output)) {
    return ["the output is not a JSON object"];
  }
  const notArray = (key) => (Array.isArray(output[key]) ? [] : [`${key} is not an array`]);
  const severity = severityPaths(output, "output").map((path) => `${path} sets a severity`);
  const groups = Array.isArray(output.groups) ? groupProblems(output.groups, candidates.judged) : [];
  const rulings = Array.isArray(output.scanner) ? rulingProblems(output.scanner, candidates) : [];
  return [...notArray("groups"), ...notArray("scanner"), ...severity, ...groups, ...rulings];
}

// The whole output is checked before anything is built, so a malformed pass
// never reaches GitHub.
function requireMergeOutput(output, candidates) {
  const problems = mergeProblems(output, candidates);
  if (problems.length > 0) {
    throw new Error(`The merge pass output is refused; do not post: ${problems.join("; ")}`);
  }
}

export { requireMergeOutput };
