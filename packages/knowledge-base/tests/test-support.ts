import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const exampleNames = [
  "clean-code.clean-code.md",
  "clean-code.meaningful-names.md",
  "clean-code.functions.md",
  "clean-code.comments.md",
  "clean-code.formatting.md",
  "refactoring.move-method.md",
  "design-patterns.strategy.md",
  "ux-ui-design.accessible-dialogs.md",
];

export async function exampleText(name: string): Promise<string> {
  return readFile(join(packageRoot, "examples", "entries", name), "utf8");
}

export async function exampleRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "knowledge-base-test-"));
  const entries = join(root, "entries");
  await mkdir(entries, { recursive: true });
  for (const name of exampleNames) await writeFile(join(entries, name), await exampleText(name), "utf8");
  return root;
}

export async function removeRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

export { packageRoot };
