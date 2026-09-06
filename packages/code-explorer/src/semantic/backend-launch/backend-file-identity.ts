export type BackendFileIdentity = {
  canonical_path?: string;
  device?: string;
  file_id?: string;
  sha256?: string;
  regular_file: boolean;
  link_or_reparse_point: boolean;
};

export function isCompleteBackendFile(file: BackendFileIdentity): boolean {
  return Boolean(
    file.device &&
      file.file_id &&
      file.sha256 &&
      file.regular_file &&
      !file.link_or_reparse_point,
  );
}
