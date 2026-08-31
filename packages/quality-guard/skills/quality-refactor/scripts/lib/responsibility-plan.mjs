/**
 * Turn validated responsibility discovery into independently runnable work.
 * Scanner units are evidence only. The plan follows responsibility ownership
 * and dependency order, so an extraction can carry its callers and tests.
 */

function clone(value) {
  return structuredClone(value);
}

function inScope(path, scope) {
  return scope.some((target) => path === target || path.startsWith(`${target}/`));
}

function orderedOutcomes(outcomes) {
  const byName = new Map(outcomes.map((outcome) => [outcome.responsibility, outcome]));
  const ordered = [];
  const pending = new Set(byName.keys());

  while (pending.size > 0) {
    const ready = [...pending]
      .map((name) => byName.get(name))
      .filter((outcome) => (outcome.dependsOn ?? []).every((dependency) => !pending.has(dependency)));
    if (ready.length === 0) throw new Error("responsibility plan: structural outcomes have a dependency cycle");
    for (const outcome of ready.sort((left, right) => left.responsibility.localeCompare(right.responsibility))) {
      pending.delete(outcome.responsibility);
      ordered.push(outcome);
    }
  }
  return ordered;
}

function taskFor(outcome, responsibility) {
  return {
    responsibility: outcome.responsibility,
    title: `Move ${outcome.responsibility} to ${outcome.desiredOwner}`,
    paths: [outcome.directory],
    callSiteMigrations: clone(responsibility.consumers),
    testMigrations: clone(outcome.stableContracts),
    dependencies: clone(outcome.dependsOn ?? []),
    scannerSymptoms: clone(outcome.evidence.scannerSymptoms ?? []),
    compatibilityRemovals: clone(outcome.compatibilityRemovals),
  };
}

/**
 * Build tasks from structural outcomes, reporting rather than expanding scope
 * for unrelated scanner findings. A concept that names several material
 * targets returns a selection request before it can create work.
 */
export function buildStructuralPlan(discovery, options = {}) {
  const candidates = options.conceptCandidates ?? [];
  if (candidates.length > 1) {
    return { status: "needs_scope_confirmation", candidates: clone(candidates), tasks: [], clusters: [], outOfScopeViolations: [] };
  }

  const scope = discovery.stagedMap.targetScope;
  const responsibilities = new Map(discovery.stagedMap.responsibilities.map((item) => [item.name, item]));
  const outcomes = orderedOutcomes(discovery.structuralOutcomes);
  const tasks = outcomes.map((outcome) => taskFor(outcome, responsibilities.get(outcome.responsibility)));
  const largeScope = scope.length >= 50;
  const clusterSize = options.clusterSize ?? 10;
  const clusters = largeScope
    ? Array.from({ length: Math.ceil(tasks.length / clusterSize) }, (_, index) => {
        const members = tasks.slice(index * clusterSize, (index + 1) * clusterSize);
        return { responsibilities: members.map((task) => task.responsibility), tasks: members };
      })
    : [{ responsibilities: tasks.map((task) => task.responsibility), tasks }];
  const violations = options.violations ?? [];

  return {
    status: "ready",
    tasks,
    clusters,
    largeScope,
    outOfScopeViolations: clone(violations.filter((violation) => !inScope(violation.path, scope))),
  };
}

function countsDoNotRise(before, after) {
  return Object.entries(after).every(([rule, count]) => count <= (before[rule] ?? 0));
}

function sameTarget(actual, target) {
  return Object.entries(target).every(([key, expected]) => JSON.stringify(actual[key]) === JSON.stringify(expected));
}

/**
 * Compare a final structural result with the immutable evidence collected
 * before planning. Intermediate counts can rise only inside an ordered unit,
 * and all build and behavior checks must be green before completion.
 */
export function evaluateStructuralCompletion({ initial, behavior, units, final, target }) {
  const recordedInitial = clone(initial);
  if (behavior.build !== "passed" || behavior.tests !== "passed") {
    return { status: "blocked_red_baseline", initial: recordedInitial, trackedBaselineChanged: false, units: [] };
  }

  const evaluatedUnits = units.map((unit) => {
    const intermediateCounts = unit.steps.map((step) => step.scanner ?? {});
    const temporaryRedistribution = intermediateCounts.some((counts) => !countsDoNotRise(initial.scanner, counts));
    const finalStep = intermediateCounts.at(-1) ?? initial.scanner;
    if (!countsDoNotRise(initial.scanner, finalStep)) {
      return { id: unit.id, temporaryRedistribution, resolved: false };
    }
    return { id: unit.id, temporaryRedistribution, resolved: true };
  });
  if (evaluatedUnits.some((unit) => !unit.resolved) || !countsDoNotRise(initial.scanner, final.scanner)) {
    return { status: "regression", initial: recordedInitial, trackedBaselineChanged: false, units: evaluatedUnits };
  }
  if (!sameTarget(final.architecture, target)) {
    return { status: "incomplete_architecture", initial: recordedInitial, trackedBaselineChanged: false, units: evaluatedUnits };
  }
  return { status: "ready", initial: recordedInitial, trackedBaselineChanged: false, units: evaluatedUnits };
}
