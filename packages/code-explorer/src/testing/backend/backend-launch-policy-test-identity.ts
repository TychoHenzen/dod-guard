import type { BackendIdentity } from "../../semantic/backend-launch/backend-launch-policy.js";

export const identity: BackendIdentity = {
  canonical_path: "/host/bin/rust-analyzer",
  device: "host-device",
  file_id: "host-file",
  sha256: "a".repeat(64),
  version: "1.0.0",
  regular_file: true,
  link_or_reparse_point: false,
};

export function pythonIdentity(
  overrides: Partial<BackendIdentity> = {},
): BackendIdentity {
  return {
    ...identity,
    canonical_path: "/host/bin/node",
    entrypoints: [
      {
        canonical_path: "/host/npm/node_modules/pyright/langserver.index.js",
        device: "host-device",
        file_id: "entrypoint-file",
        sha256: "b".repeat(64),
        regular_file: true,
        link_or_reparse_point: false,
      },
    ],
    package_metadata: {
      canonical_path: "/host/npm/node_modules/pyright/package.json",
      device: "host-device",
      file_id: "package-file",
      sha256: "d".repeat(64),
      regular_file: true,
      link_or_reparse_point: false,
    },
    ...overrides,
  };
}
