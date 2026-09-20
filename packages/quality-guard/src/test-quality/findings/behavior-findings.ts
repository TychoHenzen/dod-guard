import type { Evidence } from "../types.js";
import { activeTests, makeFinding } from "./finding.js";

function detailsFor(
  behavior: Evidence["sources"][number]["behaviors"][number],
) {
  if (behavior.trivial)
    return {
      heuristic: "T3",
      rule: "trivial-test",
      message: `trivial behavior ${behavior.id} has no active documentary test`,
      remediation:
        "Add the cheap test that documents this behavior instead of relying on aggregate coverage.",
    };
  if (behavior.kind === "boundary")
    return {
      heuristic: "T5",
      rule: "boundary-test",
      message: `boundary ${behavior.id} has no active test evidence`,
      remediation:
        "Test the declared edge values and expected results, including the adjacent in-range value.",
    };
  return {
    heuristic: "T1",
    rule: "insufficient-tests",
    message: `behavior ${behavior.id} has no active test evidence`,
    remediation:
      "Add a behavior-oriented test for the declared path or explain why it is outside this suite.",
  };
}

function missingFinding(
  sourcePath: string,
  behavior: Evidence["sources"][number]["behaviors"][number],
) {
  return [
    makeFinding({
      ...detailsFor(behavior),
      path: sourcePath,
      evidence: {
        behaviorId: behavior.id,
        ...(behavior.boundary ? { boundary: behavior.boundary } : {}),
      },
    }),
  ];
}

function missingBehaviorFindings(evidence: Evidence) {
  return evidence.sources.flatMap((source) =>
    source.behaviors.flatMap((behavior) => {
      if (activeTests(evidence, behavior.id).length === 0)
        return missingFinding(source.path, behavior);
      return [];
    }),
  );
}

export function behaviorFindings(evidence: Evidence) {
  return missingBehaviorFindings(evidence);
}
