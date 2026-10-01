import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const knowledgeToolNames = [
  "knowledge_get_entry",
  "knowledge_list_chapters",
  "knowledge_list_entries",
  "knowledge_list_sections",
  "knowledge_search",
];

export async function createSyntheticKnowledgeRoot(entries: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "knowledge-base-synthetic-"));
  await mkdir(join(root, "entries"), { recursive: true });
  for (const [name, content] of Object.entries(entries)) {
    const path = join(root, "entries", name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
  return root;
}

export async function removeRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

export async function withSyntheticKnowledgeRoot<Result>(
  entries: Record<string, string>,
  action: (root: string) => Promise<Result>,
): Promise<Result> {
  const root = await createSyntheticKnowledgeRoot(entries);
  try {
    return await action(root);
  } finally {
    await removeRoot(root);
  }
}

export async function withTemporaryDirectory<Result>(
  prefix: string,
  action: (root: string) => Promise<Result>,
): Promise<Result> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await action(root);
  } finally {
    await removeRoot(root);
  }
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
