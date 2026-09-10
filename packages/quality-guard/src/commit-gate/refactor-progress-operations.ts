import type { QualityConfig } from "./config.js";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import {
  isProductionArchitecturePath,
  normalizeArchitecturePath,
} from "./placement.js";

export function productionTypes(
  files: ArchitectureFileFact[],
  config: QualityConfig,
) {
  return files
    .filter((file) => isProductionArchitecturePath(file.path, config))
    .flatMap((file) =>
      file.types.map((type) => ({
        path: normalizeArchitecturePath(file.path),
        type,
      })),
    )
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.type.name.localeCompare(right.type.name),
    );
}

function addOperations(
  result: Map<string, string[]>,
  item: ReturnType<typeof productionTypes>[number],
): void {
  for (const member of item.type.members.filter(
    (member) => member.kind === "method",
  )) {
    const owners = result.get(member.name) ?? [];
    owners.push(item.type.name);
    result.set(member.name, owners);
  }
}

export function operations(
  types: ReturnType<typeof productionTypes>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const item of types) addOperations(result, item);
  for (const owners of result.values()) owners.sort();
  return result;
}

function moveFor(
  operation: string,
  oldOwners: string[],
  newOwners: string[] | undefined,
) {
  if (
    !newOwners ||
    oldOwners.length !== 1 ||
    newOwners.length !== 1 ||
    oldOwners[0] === newOwners[0]
  )
    return undefined;
  return {
    operation,
    from: oldOwners[0] as string,
    to: newOwners[0] as string,
  };
}

export function ownershipMoves(
  before: ReturnType<typeof productionTypes>,
  after: ReturnType<typeof productionTypes>,
) {
  const beforeOperations = operations(before);
  const afterOperations = operations(after);
  const moves: Array<{ operation: string; from: string; to: string }> = [];
  for (const [operation, oldOwners] of beforeOperations) {
    const move = moveFor(operation, oldOwners, afterOperations.get(operation));
    if (move) moves.push(move);
  }
  return moves.sort(
    (left, right) =>
      left.operation.localeCompare(right.operation) ||
      left.from.localeCompare(right.from) ||
      left.to.localeCompare(right.to),
  );
}
