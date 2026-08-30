import assert from "node:assert/strict";
import { it } from "node:test";
import { createNativeBackendInspector } from "./native-backend-inspector.js";

it("does not authorize a backend from a project or ambient-path-like root", () => {
  const inspector = createNativeBackendInspector([process.cwd()], process.cwd());
  assert.equal(inspector("rust", process.platform === "win32" ? "node.exe" : "node"), undefined);
});

it("resolves Roslyn from the pinned dotnet tool-store payload, never its command shim", () => {
  if (process.platform !== "win32") return;
  const root = `${process.env.USERPROFILE}\\.dotnet\\tools`;
  const identity = createNativeBackendInspector([root])("csharp", "roslyn-language-server.exe");
  assert.ok(identity?.canonical_path?.includes("\\.store\\roslyn-language-server\\5.11.0-1.26380.4\\"));
  assert.equal(identity?.canonical_path?.endsWith("\\roslyn-language-server.cmd"), false);
});
