import { FakeSemanticAdapter } from "../semantic/fake-semantic-adapter.js";

const result = {
  operation: "search" as const,
  revision: { generation: 0, manifest_sha256: "fixture" },
  symbols: [],
};

export function statusBackend(
  state: "ready" | "unavailable" | "failed",
  failureCode?: string,
): FakeSemanticAdapter {
  const fake = new FakeSemanticAdapter();
  if (state === "ready") fake.setReady();
  if (state === "failed")
    fake.setFailed(failureCode ?? "initialization_failed");
  fake.setResult(result);
  return fake;
}
