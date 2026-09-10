import type { QualityConfig } from "./config.js";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import type { ArchitectureTypeFact } from "./architecture-type-fact.js";
import {
  isProductionArchitecturePath,
  normalizeArchitecturePath,
} from "./placement.js";
import { publicFindings } from "./encapsulation-public.js";

function forwardingKeys(type: ArchitectureTypeFact): Set<string> {
  return new Set(
    type.forwardingPaths.map((path) => `${path.member}\0${path.target}`),
  );
}

function forwardingFindings(
  type: ArchitectureTypeFact,
  previous: ArchitectureTypeFact | undefined,
  filePath: string,
) {
  const priorForwarding = previous
    ? forwardingKeys(previous)
    : new Set<string>();
  return type.forwardingPaths.flatMap((forwarding) => {
    if (priorForwarding.has(`${forwarding.member}\0${forwarding.target}`))
      return [];
    return [
      {
        kind: "forwarding-path" as const,
        path: filePath,
        type: type.name,
        member: forwarding.member,
        target: forwarding.target,
      },
    ];
  });
}

function fileFindings(
  afterFile: ArchitectureFileFact,
  beforeByPath: Map<string, ArchitectureFileFact>,
  input: { afterFiles: ArchitectureFileFact[]; config: QualityConfig },
) {
  const filePath = normalizeArchitecturePath(afterFile.path);
  const previousTypes = beforeByPath.get(filePath)?.types ?? [];
  const previous = new Map(previousTypes.map((type) => [type.name, type]));
  return afterFile.types.flatMap((type) => [
    ...publicFindings({
      ...input,
      type,
      previous: previous.get(type.name),
      filePath,
    }),
    ...forwardingFindings(type, previous.get(type.name), filePath),
  ]);
}

export function analyzeEncapsulation(input: {
  beforeFiles: ArchitectureFileFact[];
  afterFiles: ArchitectureFileFact[];
  affectedPaths: string[];
  config: QualityConfig;
}) {
  const beforeByPath = new Map(
    input.beforeFiles.map((file) => [
      normalizeArchitecturePath(file.path),
      file,
    ]),
  );
  const affected = new Set(input.affectedPaths.map(normalizeArchitecturePath));
  const findings = [];
  for (const afterFile of input.afterFiles) {
    const filePath = normalizeArchitecturePath(afterFile.path);
    if (
      !(
        affected.has(filePath) &&
        isProductionArchitecturePath(filePath, input.config)
      )
    )
      continue;
    findings.push(...fileFindings(afterFile, beforeByPath, input));
  }
  return findings.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}
