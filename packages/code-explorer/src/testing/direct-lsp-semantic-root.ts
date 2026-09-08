import type {
  ProjectRevision,
  SymbolIdentity,
} from "../semantic/contracts/contract.js";
import type { ProjectRoot } from "../semantic/api/public-api.js";
import { testLocation } from "./semantic-test-shapes.js";

export const semanticRoot: ProjectRoot = {
  canonicalPath: "/project",
  revalidate: () => "ready",
  resolveClientPath: (path) => `/project/${path}`,
  classifyBackendPath: (path) =>
    path.startsWith("/project/")
      ? { relative_path: path.slice(9) }
      : { external: true },
  openProtected: () => ({ path: "/project/src/main.rs", handle: undefined }),
  protectedRead: () => ({
    path: "/project/src/main.rs",
    bytes: "fn main() {}\n",
  }),
};

export function semanticRootWithRead(path: string, bytes: string): ProjectRoot {
  return { ...semanticRoot, protectedRead: () => ({ path, bytes }) };
}

export function projectBackendPath(uri: string): string | undefined {
  return uri.startsWith("file:///project/")
    ? uri.slice("file:///project/".length)
    : undefined;
}

export function mainRustSymbol() {
  return {
    id: "entry",
    name: "main",
    language: "rust" as const,
    kind: "function" as const,
    location: testLocation(
      "src/main.rs",
      { line: 0, character: 3 },
      { line: 0, character: 7 },
    ),
  };
}

export function rustEntrySymbol(): SymbolIdentity {
  return {
    id: "entry",
    name: "entry",
    language: "rust",
    kind: "function",
    location: testLocation(
      "src/main.rs",
      { line: 0, character: 0 },
      { line: 0, character: 5 },
    ),
  };
}

export function fixtureRevision(): ProjectRevision {
  return { generation: 0, manifest_sha256: "fixture" };
}
