import type { ArchitectureFileFact } from "./architecture-file-fact.js";

export const mapSource =
  '{"targetScope":["src/service.ts"],"responsibilities":' +
  '[{"name":"run","currentOwners":["Service"],"consumers":[],' +
  '"dependencies":[]}],"desired":{"ownership":[{"responsibility":' +
  '"run","owner":"Runner"}],"boundaries":[]}}';

export const before: ArchitectureFileFact[] = [
  {
    path: "src/service.ts",
    imports: [],
    references: [],
    types: [
      {
        name: "Service",
        members: [{ name: "run", kind: "method", visibility: "private" }],
        dependencies: [],
        forwardingPaths: [],
      },
    ],
  },
];
