/**
 * A scenario's stable identity across a spec delta and its eventual merge
 * into the main tree: `<group>/<capability>::<requirement title>||<scenario
 * title>`. Extends the `groupTitle||scenarioTitle` pair the deleted
 * `scenario-identity.ts` used, prefixed with the capability path so ids stay
 * unique across specs - two different capabilities can otherwise share a
 * requirement title.
 */
export function buildScenarioId(
  group: string,
  capability: string,
  requirementTitle: string,
  scenarioTitle: string,
): string {
  return `${group}/${capability}::${requirementTitle}||${scenarioTitle}`;
}
