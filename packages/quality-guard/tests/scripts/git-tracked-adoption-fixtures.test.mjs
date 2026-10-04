import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const OVER_BOUND_LINES = 301;

export function tempRepo() {
  const root = mkdtempSync(join(tmpdir(), "qg-tracked-"));
  mkdirSync(join(root, ".git"));
  return root;
}

export function writeTarget(root, name, lines) {
  const filePath = join(root, name);
  writeFileSync(filePath, "const x = 1;\n".repeat(lines));
  return filePath;
}

export function testTarget(name) {
  const root = tempRepo();
  return { root, filePath: writeTarget(root, name, 10) };
}

export function fakeInput(filePath) {
  return { tool_name: "Edit", tool_input: { file_path: filePath } };
}

export function gateDeps(overrides = {}) {
  return { ...overrides };
}
