import { activeTests, makeFinding } from "./finding.js";
import type { Evidence } from "./types.js";

function unavailableCoverageFinding() {
  return makeFinding({
    heuristic: "T2",
    rule: "coverage-evidence",
    path: ".",
    message: "no coverage provider or source observations were supplied",
    remediation:
      "Run a coverage provider and record per-source observations; missing coverage is not zero.",
    evidence: { status: "unavailable" },
  });
}

function coverageFinding(
  source: Evidence["sources"][number],
  observations: NonNullable<Evidence["coverage"]>["observations"],
) {
  const observed = observations.some(
    (observation) => observation.sourcePath === source.path,
  );
  if (source.behaviors.length === 0 || observed) return [];
  return [
    makeFinding({
      heuristic: "T2",
      rule: "coverage-evidence",
      path: source.path,
      message: "source has behavior evidence but no coverage observation",
      remediation:
        "Add this source's observation or record why the provider excludes it.",
      evidence: { sourcePath: source.path, status: "unobserved" },
    }),
  ];
}

function coverageFindings(evidence: Evidence) {
  if (!evidence.coverage) return [unavailableCoverageFinding()];
  return evidence.sources.flatMap((source) =>
    coverageFinding(source, evidence.coverage?.observations ?? []),
  );
}

function skipFindings(evidence: Evidence) {
  return evidence.tests.flatMap((test) =>
    test.status === "skipped" && test.skipReason?.kind === "ambiguity"
      ? [
          makeFinding({
            heuristic: "T4",
            rule: "ignored-test-ambiguity",
            path: test.path,
            message: `skipped test ${test.id} records an unresolved ambiguity`,
            remediation: `Resolve the requirement or link the decision: ${test.skipReason.detail}`,
            evidence: { testId: test.id, skipReason: test.skipReason },
          }),
        ]
      : [],
  );
}

function bugFindings(evidence: Evidence) {
  return (evidence.bugs ?? []).flatMap((bug) => {
    const missing = bug.behaviorIds.filter(
      (id) => activeTests(evidence, id).length === 0,
    );
    return missing.length > 0
      ? [
          makeFinding({
            heuristic: "T6",
            rule: "bug-regression-test",
            path: bug.sourcePath,
            message: `bug ${bug.id} has affected behavior without regression coverage`,
            remediation:
              "Add regression coverage for the reported behavior and nearby cases.",
            evidence: { bugId: bug.id, missingBehaviorIds: missing },
          }),
        ]
      : [];
  });
}

export function evidenceFindings(evidence: Evidence) {
  return [
    ...coverageFindings(evidence),
    ...skipFindings(evidence),
    ...bugFindings(evidence),
  ];
}
