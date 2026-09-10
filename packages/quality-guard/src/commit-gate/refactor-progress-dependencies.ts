import type {
  ownershipMoves,
  productionTypes,
} from "./refactor-progress-operations.js";

export function dependencyKeys(
  types: ReturnType<typeof productionTypes>,
): Set<string> {
  return new Set(
    types.flatMap((item) =>
      item.type.dependencies.map(
        (dependency) => `${item.type.name}\0${dependency}`,
      ),
    ),
  );
}

export function dependencyReduction(
  moves: ReturnType<typeof ownershipMoves>,
  before: ReturnType<typeof productionTypes>,
  after: ReturnType<typeof productionTypes>,
): string[] {
  const beforeTypes = new Map(
    before.map((item) => [item.type.name, item.type]),
  );
  const afterTypes = new Map(after.map((item) => [item.type.name, item.type]));
  return moves.flatMap((move) => {
    const oldDependencies = beforeTypes.get(move.from)?.dependencies ?? [];
    const newDependencies = afterTypes.get(move.from)?.dependencies ?? [];
    return oldDependencies
      .filter((dependency) => !newDependencies.includes(dependency))
      .sort()
      .map((dependency) => `${move.from} no longer depends on ${dependency}`);
  });
}
