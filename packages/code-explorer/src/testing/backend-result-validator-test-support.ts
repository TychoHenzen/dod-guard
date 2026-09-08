import type {
  BackendResultValidationOptions,
} from "../semantic/backend-result/backend-result-validator.js";
import { createProjectRoot } from "../semantic/project-root/project-root.js";

const rootPath = "/repo";
const source = "fn helper() {}\n";

export const root = createProjectRoot({
  cwd: rootPath,
  platform: "posix",
  filesystem: {
    realpath: (path) => path,
    stat: (path) => ({
      dev: 1,
      ino: path === rootPath ? 1 : 2,
    }),
    open: (path) => path,
    fstat: () => ({ dev: 1, ino: 2 }),
    read: () => source,
    close: () => {},
  },
});

export const options: BackendResultValidationOptions = {
  allowedLanguages: ["rust"],
  root,
  currentGeneration: 1,
};

function definitionLocation() {
  return {
    path: "src/lib.rs",
    range: {
      start: { line: 0, character: 3 },
      end: { line: 0, character: 9 },
    },
  };
}

function definitionSymbol(location: ReturnType<typeof definitionLocation>) {
  return {
    id: "rust:helper",
    name: "helper",
    language: "rust",
    kind: "function",
    location,
  };
}

function definitionRelation() {
  const location = definitionLocation();
  return {
    relation: "definition",
    symbol: definitionSymbol(location),
    location,
  };
}

export function definition(overrides: Record<string, unknown> = {}) {
  return {
    operation: "definition",
    revision: { generation: 1, manifest_sha256: "fixture" },
    relations: [definitionRelation()],
    ...overrides,
  };
}
