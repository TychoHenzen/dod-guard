import { it } from "node:test";
import {
  assert,
  createBackendLaunchPolicy,
  identity,
  policy,
  policyAllowlist,
} from "../testing/backend/backend-launch-policy-test-support.js";

it("refuses a restart when its accepted identity tuple changes", () => {
  let current = identity;
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: policyAllowlist(),
    inspect: () => current,
  });
  assert.equal(launch.prepare("rust").status, "ready");
  current = { ...identity, sha256: "b".repeat(64) };
  assert.deepEqual(launch.prepare("rust"), {
    status: "unavailable",
    code: "backend_identity_changed",
  });
});

it("rejects and terminates a process \
when verification changes after start", () => {
  let current = identity;
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: policyAllowlist(),
    inspect: () => current,
  });
  assert.equal(launch.prepare("rust").status, "ready");
  current = { ...identity, version: "1.0.1" };
  assert.deepEqual(launch.confirmInitialized("rust"), {
    status: "unavailable",
    code: "backend_identity_changed",
    terminate: true,
  });
});

it("refuses launch before spawn when device \
or file identity cannot be proven", () => {
  assert.deepEqual(policy({ device: undefined }).prepare("rust"), {
    status: "unavailable",
    code: "backend_identity_unverifiable",
  });
});

it("reports an unaccepted incompatible version without relabeling it", () => {
  assert.deepEqual(policy({ version: "2.0.0" }).prepare("rust"), {
    status: "unavailable",
    code: "unsupported_backend_version",
  });
});
