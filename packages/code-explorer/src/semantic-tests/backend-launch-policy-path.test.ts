import { it } from "node:test";
import {
  assert,
  assertRustPreparation,
  createBackendLaunchPolicy,
  identity,
  policyAllowlist,
} from "../testing/backend-launch-policy-test-support.js";

it("uses configured platform path comparison and rejects project descendants", () => {
  const windowsIdentity = {
    ...identity,
    canonical_path: "C:\\host\\rust-analyzer.exe",
  };
  const allowlist = [
    {
      ...policyAllowlist()[0],
      executable_basename: "rust-analyzer.exe",
    },
  ];
  const create = (canonical_path: string) =>
    createBackendLaunchPolicy({
      project_root: "C:\\project",
      platform: "win32",
      allowlist,
      inspect: () => ({
        ...windowsIdentity,
        canonical_path,
      }),
    });
  assert.equal(create(windowsIdentity.canonical_path).prepare("rust").status, "ready");
  assert.deepEqual(create("C:\\project\\bin\\rust-analyzer.exe").prepare("rust"), {
    status: "unavailable",
    code: "backend_identity_unverifiable",
  });
  assert.deepEqual(create("C:\\host\\other.exe").prepare("rust"), {
    status: "unavailable",
    code: "backend_identity_unverifiable",
  });
});

it("treats Windows executable path and basename case changes as the same identity", () => {
  let current = {
    ...identity,
    canonical_path: "C:\\HOST\\RUST-ANALYZER.EXE",
  };
  const launch = createBackendLaunchPolicy({
    project_root: "C:\\project",
    platform: "win32",
    allowlist: [
      {
        ...policyAllowlist()[0],
        executable_basename: "rust-analyzer.exe",
      },
    ],
    inspect: () => current,
  });
  assert.equal(launch.prepare("rust").status, "ready");
  current = {
    ...current,
    canonical_path: "c:\\host\\rust-analyzer.exe",
  };
  assertRustPreparation(launch.prepare("rust"), current.canonical_path);
});
