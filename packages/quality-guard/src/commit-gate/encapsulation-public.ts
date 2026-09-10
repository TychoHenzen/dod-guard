import type { QualityConfig } from "./config.js";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import type { ArchitectureMemberFact } from "./architecture-member-fact.js";
import type { ArchitectureTypeFact } from "./architecture-type-fact.js";
import {
  isProductionArchitecturePath,
  normalizeArchitecturePath,
} from "./placement.js";
import { observedCallers } from "./encapsulation-callers.js";

function key(
  type: ArchitectureTypeFact,
  member: ArchitectureMemberFact,
): string {
  return `${type.name}.${member.name}`;
}

function members(type: ArchitectureTypeFact): Set<string> {
  return new Set(
    type.members
      .filter((member) => member.visibility === "public")
      .map((member) => `${member.kind}\0${member.name}`),
  );
}

function surfaceFinding(
  filePath: string,
  symbol: string,
  callers: { productionCallers: string[]; testCallers: string[] },
) {
  return {
    kind: "public-surface-growth" as const,
    path: filePath,
    symbol,
    ...callers,
  };
}

function testOnlyFinding(
  filePath: string,
  symbol: string,
  callers: { productionCallers: string[]; testCallers: string[] },
) {
  return {
    kind: "test-only-seam" as const,
    path: filePath,
    symbol,
    ...callers,
  };
}

function memberFindings(input: {
  type: ArchitectureTypeFact;
  member: ArchitectureMemberFact;
  priorMembers: Set<string>;
  filePath: string;
  afterFiles: ArchitectureFileFact[];
  config: QualityConfig;
}) {
  if (input.priorMembers.has(`${input.member.kind}\0${input.member.name}`))
    return [];
  const symbol = key(input.type, input.member);
  const callers = observedCallers(symbol, input.afterFiles, input.config);
  const finding = surfaceFinding(input.filePath, symbol, callers);
  if (
    callers.productionCallers.length === 0 &&
    callers.testCallers.length > 0
  ) {
    return [finding, testOnlyFinding(input.filePath, symbol, callers)];
  }
  return [finding];
}

export function publicFindings(input: {
  type: ArchitectureTypeFact;
  previous: ArchitectureTypeFact | undefined;
  filePath: string;
  afterFiles: ArchitectureFileFact[];
  config: QualityConfig;
}) {
  const priorMembers = input.previous
    ? members(input.previous)
    : new Set<string>();
  return input.type.members
    .filter((member) => member.visibility === "public")
    .flatMap((member) => memberFindings({ ...input, member, priorMembers }));
}
