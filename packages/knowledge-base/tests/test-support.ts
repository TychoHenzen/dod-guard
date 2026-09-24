import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const shippedKnowledgeRoot = join(packageRoot, "knowledge");

export const cleanCodeSectionKeys = [
  "clean-code.boundaries",
  "clean-code.classes",
  "clean-code.comments",
  "clean-code.concurrency",
  "clean-code.emergence",
  "clean-code.error-handling",
  "clean-code.formatting",
  "clean-code.foundation",
  "clean-code.functions",
  "clean-code.junit-internals",
  "clean-code.meaningful-names",
  "clean-code.objects-data-structures",
  "clean-code.refactoring-serialdate",
  "clean-code.successive-refinement",
  "clean-code.systems",
  "clean-code.unit-tests",
];

export async function shippedEntryText(name: string): Promise<string> {
  return readFile(join(shippedKnowledgeRoot, "entries", name), "utf8");
}

export async function copyShippedKnowledgeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "knowledge-base-test-"));
  await cp(shippedKnowledgeRoot, root, { recursive: true });
  return root;
}

export const createKnowledgeRoot = copyShippedKnowledgeRoot;

export async function removeRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

export function toolText(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  return content?.[0]?.type === "text" ? (content[0].text ?? "") : "";
}

export async function callKnowledgeTool<T>(
  client: Client,
  name: string,
  arguments_: Record<string, unknown> = {},
): Promise<T> {
  return JSON.parse(toolText(await client.callTool({ name, arguments: arguments_ }))) as T;
}

export { packageRoot };
