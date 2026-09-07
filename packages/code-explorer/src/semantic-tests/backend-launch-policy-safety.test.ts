import { it } from "node:test";
import {
  assert,
  createBackendLaunchPolicy,
  identity,
  policyAllowlist,
} from "../testing/backend-launch-policy-test-support.js";

it("rejects an allowlist mode without a verified C# analyzer-safe sentinel", () => {
  const unsafe = policyAllowlist({
    language: "csharp",
    sentinel_passed: false,
  });
  assert.equal(unsafe[0].sentinel_passed, false);
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: unsafe,
    inspect: () => identity,
  });
  assert.deepEqual(launch.prepare("csharp"), {
    status: "unavailable",
    code: "unsafe_backend_mode",
  });
  const safe = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: [
      {
        ...policyAllowlist()[0],
        language: "csharp",
        safe_initialization_options: {
          analyzers: false,
          source_generators: false,
        },
      },
    ],
    inspect: () => identity,
  });
  assert.deepEqual(safe.safeOptions("csharp"), {
    analyzers: false,
    source_generators: false,
  });
  assert.equal(safe.prepare("csharp").status, "ready");
});

it("does not launch a mode whose sentinel proof is absent", () => {
  const allowlist = policyAllowlist({
    sentinel_passed: false,
  });
  const launch = createBackendLaunchPolicy({
    project_root: "/project",
    allowlist,
    inspect: () => identity,
  });
  assert.deepEqual(launch.prepare("rust"), {
    status: "unavailable",
    code: "unsafe_backend_mode",
  });
});
