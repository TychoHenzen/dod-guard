import process from "node:process";
import { failure } from "./failure.mjs";

// Codex nests the plugin list under "installed"; Claude emits the list itself.
const ENTRY_LIST = {
  codex: (registry) => registry?.installed,
  claude: (registry) => registry,
};

// Returns { value } or { error }, so a malformed input is reported as data, not thrown.
async function readStdinJson() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = Buffer.concat(chunks).toString("utf8");
    return { value: JSON.parse(input.startsWith("﻿") ? input.slice(1) : input) };
  } catch (error) {
    return { error: error.message };
  }
}

export async function readRegistry(ctx) {
  const input = await readStdinJson();
  if (input.error !== undefined) {
    return failure(ctx, `Registry input is missing or malformed: ${input.error}`, { registry: "unavailable" });
  }
  const entries = ENTRY_LIST[ctx.client](input.value);
  if (!Array.isArray(entries)) {
    return failure(ctx, `Registry does not contain the expected ${ctx.client} plugin list.`, { registry: "malformed" });
  }
  return entries;
}
