import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function writeWorkspaceFiles(
  root: string,
  files: Record<string, string>,
): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const file = join(root, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}
