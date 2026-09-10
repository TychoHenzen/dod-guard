import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compareToBaseline,
  readBaseline,
  writeBaseline,
} from "./baseline-lib.mjs";

export const OVER_BOUND_LINES = 301;

export function tempRepo() {
  const root = mkdtempSync(join(tmpdir(), "qg-tracked-"));
  mkdirSync(join(root, ".github", "quality"), { recursive: true });
  return root;
}

export function writeTarget(root, name, lines) {
  const filePath = join(root, name);
  writeFileSync(filePath, "const x = 1;\n".repeat(lines));
  return filePath;
}

export function writeBaselineFile(root, files, counts) {
  const path = join(root, ".github", "quality", "quality-baseline.json");
  writeFileSync(
    path,
    JSON.stringify({ version: 2, total: 0, files, counts }, null, 2) + "\n",
  );
  return path;
}

export function fakeInput(filePath) {
  return { tool_name: "Edit", tool_input: { file_path: filePath } };
}

export function gateDeps(overrides = {}) {
  return { readBaseline, compareToBaseline, writeBaseline, ...overrides };
}
