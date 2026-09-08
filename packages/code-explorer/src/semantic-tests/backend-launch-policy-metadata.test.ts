import { it } from "node:test";
import {
  assert,
  createBackendLaunchPolicy,
  pythonAllowlist,
  pythonIdentity,
} from "../testing/backend/backend-launch-policy-test-support.js";

it("rejects a Python package metadata byte replacement before spawn", () => {
  const current = pythonIdentity({
    package_metadata: {
      canonical_path: "/host/npm/node_modules/pyright/package.json",
      device: "host-device",
      file_id: "package-file",
      sha256: "c".repeat(64),
      regular_file: true,
      link_or_reparse_point: false,
    },
  });
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: pythonAllowlist(),
    inspect: () => current,
  });
  assert.deepEqual(launch.prepare("python"), {
    status: "unavailable",
    code: "backend_identity_changed",
  });
});
