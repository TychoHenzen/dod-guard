import { it } from "node:test";
import { assert, assertRustPreparation, policy } from "../testing/backend/backend-launch-policy-test-support.js";

it("ignores project backend commands and keeps the allowlisted command", () => {
  const preparation = policy().prepare("rust", {
    command: "project-owned-server",
    arguments: ["--unsafe"],
  });
  assertRustPreparation(preparation, "/host/bin/rust-analyzer", "project_backend_config_ignored");
});

it("rejects protocol write requests without retaining their payload", () => {
  const result = policy().handleBackendRequest("workspace/applyEdit", {
    changes: { "/project/a.rs": [] },
  });
  assert.deepEqual(result, {
    accepted: false,
    code: "backend_write_rejected",
  });
});

it("does not install or substitute a missing allowlisted executable", () => {
  assert.deepEqual(policy({ canonical_path: undefined }).prepare("rust"), {
    status: "unavailable",
    code: "backend_unavailable",
  });
});

it("rejects non-loopback backend endpoints", () => {
  assert.deepEqual(policy().setEndpoint("rust", "https://example.test/lsp"), {
    status: "unavailable",
    code: "backend_endpoint_rejected",
  });
  assert.deepEqual(policy().setEndpoint("rust", "http://127.0.0.1:8181"), {
    status: "ready",
  });
  assert.deepEqual(policy().setEndpoint("rust", "http://localhost:8181"), {
    status: "unavailable",
    code: "backend_endpoint_rejected",
  });
  assert.deepEqual(policy({ endpoint: "stdio" }).setEndpoint("rust", "stdio"), {
    status: "ready",
  });
  assert.deepEqual(
    policy({
      endpoint: "http://127.1.2.3:8181",
    }).setEndpoint("rust", "http://127.1.2.3:8181"),
    { status: "ready" },
  );
  assert.deepEqual(policy({ endpoint: "http://[::1]:8181" }).setEndpoint("rust", "http://[::1]:8181"), {
    status: "ready",
  });
});
