import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function loadAdapterSelectionJson(relativePath: string): unknown {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8"),
  );
}
