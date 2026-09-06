import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function writeMirrorFile(
  root: string,
  relativePath: string,
  text: string,
): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), {
    recursive: true,
    mode: 0o755,
  });
  writeFileSync(target, text, {
    encoding: "utf8",
    mode: 0o444,
  });
}
