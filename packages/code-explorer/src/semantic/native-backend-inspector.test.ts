import assert from "node:assert/strict";
import { it } from "node:test";
import { createNativeBackendInspector } from "./native-backend-inspector.js";

it("does not authorize a backend from a project or ambient-path-like root", () => {
  const inspector = createNativeBackendInspector([process.cwd()], process.cwd());
  assert.equal(inspector("rust", process.platform === "win32" ? "node.exe" : "node"), undefined);
});
