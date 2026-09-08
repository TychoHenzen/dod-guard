import type { WorkspaceFileMetadata } from "./workspace-file-metadata.js";

export type WorkspaceFileMetadataReader = (
  path: string,
) => WorkspaceFileMetadata;
