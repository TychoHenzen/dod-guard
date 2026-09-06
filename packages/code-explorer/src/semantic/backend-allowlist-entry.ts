import type { Language } from "./contract.js";

export type BackendAllowlistEntry = {
  language: Language;
  executable_basename: string;
  entrypoint_basenames?: readonly string[];
  executable_sha256: string;
  entrypoint_sha256s?: readonly string[];
  package_metadata_sha256?: string | null;
  compatible_version: string;
  arguments: readonly string[];
  endpoint: "stdio" | string;
  environment: Readonly<Record<string, string>>;
  safe_initialization_options: Readonly<Record<string, unknown>>;
  sentinel_passed: boolean;
};
