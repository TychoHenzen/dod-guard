import type {
  DirectLspStatus,
  ProtectedDocumentContent,
} from "./direct-lsp.js";

export type ReadOnlyLspClient = {
  request(method: string, params: unknown): Promise<unknown>;
  openProtectedDocument?(uri: string, content: ProtectedDocumentContent): void;
  status(): DirectLspStatus;
};
