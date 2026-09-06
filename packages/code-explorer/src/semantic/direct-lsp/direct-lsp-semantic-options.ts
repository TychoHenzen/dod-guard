import type {
  Language,
  ProjectRevision,
  RelationCapabilities,
  SymbolIdentity,
} from "../contracts/contract.js";
import type { ProjectRoot } from "../project-root/project-root.js";
import type { ReadOnlyLspClient } from "./direct-lsp-semantic-client.js";

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
