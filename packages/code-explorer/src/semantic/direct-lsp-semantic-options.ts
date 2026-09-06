import type {
  Language,
  ProjectRevision,
  RelationCapabilities,
  SymbolIdentity,
} from "./contract.js";
import type { ReadOnlyLspClient } from "./direct-lsp-semantic-client.js";
import type { ProjectRoot } from "./project-root.js";

export type DirectLspSemanticOptions = {
  language: Language;
  client: ReadOnlyLspClient;
  root: ProjectRoot;
  revision: ProjectRevision;
  symbols: ReadonlyMap<string, SymbolIdentity>;
  discovery_document_paths?: readonly string[];
  capabilities: RelationCapabilities;
  toBackendUri(location: SymbolIdentity["location"]): string;
  fromBackendUri(uri: string): string | undefined;
};
