import type { BackendFileIdentity } from "./backend-file-identity.js";

export type BackendIdentity = {
  canonical_path?: string;
  device?: string;
  file_id?: string;
  sha256?: string;
  version?: string;
  regular_file: boolean;
  link_or_reparse_point: boolean;
  entrypoints?: readonly BackendFileIdentity[];
  package_metadata?: BackendFileIdentity;
};
