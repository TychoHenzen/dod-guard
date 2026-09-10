import * as path from "node:path";
import type { QualityConfig } from "./config.js";
import {
  isProductionArchitecturePath,
  normalizeArchitecturePath,
} from "./placement-paths.js";

function addedTypes(
  file: { types: string[] },
  previous: Set<string>,
): string[] {
  return [...file.types]
    .filter((name) => !previous.has(name))
    .sort((left, right) => left.localeCompare(right));
}

function directoryTypes(
  before: Map<string, Set<string>>,
  after: Map<string, Set<string>>,
  directory: string,
): { previous: Set<string>; current: Set<string> } {
  return {
    previous: before.get(directory) ?? new Set<string>(),
    current: after.get(directory) ?? new Set<string>(),
  };
}

function typeFinding(
  name: string,
  context: {
    generic: boolean;
    beforeCount: number;
    afterCount: number;
    directory: string;
    limit: number;
  },
) {
  if (!(context.generic || context.beforeCount > context.limit)) return [];
  return [
    {
      kind: context.generic
        ? ("generic-bucket" as const)
        : ("flat-accumulation" as const),
      directory: context.directory,
      addedType: name,
      beforeCount: context.beforeCount,
      afterCount: context.afterCount,
      limit: context.limit,
    },
  ];
}

function contextForFile(input: {
  file: { path: string; types: string[] };
  before: Map<string, Set<string>>;
  after: Map<string, Set<string>>;
  changed: Set<string>;
  config: QualityConfig;
}) {
  const normalized = normalizeArchitecturePath(input.file.path);
  if (
    !(
      input.changed.has(normalized) &&
      isProductionArchitecturePath(input.file.path, input.config)
    )
  )
    return null;
  const directory = path.posix.dirname(normalized);
  const { previous, current } = directoryTypes(
    input.before,
    input.after,
    directory,
  );
  return { directory, previous, current };
}

export function findingsForFile(input: {
  file: { path: string; types: string[] };
  before: Map<string, Set<string>>;
  after: Map<string, Set<string>>;
  changed: Set<string>;
  config: QualityConfig;
}) {
  const context = contextForFile(input);
  if (!context) return [];
  const { directory, previous, current } = context;
  return addedTypes(input.file, previous).flatMap((name) =>
    typeFinding(name, {
      generic: input.config.genericBuckets.includes(
        path.posix.basename(directory).toLowerCase(),
      ),
      beforeCount: previous.size,
      afterCount: current.size,
      directory,
      limit: input.config.directTypeLimit,
    }),
  );
}
