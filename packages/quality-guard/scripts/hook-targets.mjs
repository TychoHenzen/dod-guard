import { resolve } from "node:path";

const FILE_HEADER = /^\*\*\* (Add|Update|Delete) File: (.+)$/gm;
const WRITE_TOOLS = /^(Write|Edit|MultiEdit)$/;

function legacyTargets(input) {
  if (!WRITE_TOOLS.test(input?.tool_name || "")) return [];
  const filePath = input.tool_input?.file_path;
  return filePath ? [{ filePath, input }] : [];
}

function addedRuns(body) {
  const blocks = body.match(/(?:^\+(?!\+\+\+).*(?:\r?\n|$))+/gm) || [];
  return blocks.map((block) => block.trimEnd()
    .split(/\r?\n/)
    .map((line) => line.slice(1))
    .join("\n"));
}

function targetFromHeader(input, patch, headers, index) {
  const header = headers[index];
  if (header[1] === "Delete") return [];
  const bodyStart = header.index + header[0].length;
  const bodyEnd = headers[index + 1]?.index ?? patch.length;
  const filePath = resolve(input.cwd || process.cwd(), header[2].trim());
  return [{
    filePath,
    input: {
      ...input,
      tool_input: { file_path: filePath, added_runs: addedRuns(patch.slice(bodyStart, bodyEnd)) },
    },
  }];
}

function patchTargets(input) {
  const patch = input?.tool_input?.command;
  if (typeof patch !== "string") return [];
  const headers = Array.from(patch.matchAll(FILE_HEADER));
  return headers.flatMap((_, index) => targetFromHeader(input, patch, headers, index));
}

/** Files and added text runs produced by one Claude or Codex write call. */
export function hookTargets(input) {
  return input?.tool_name === "apply_patch" ? patchTargets(input) : legacyTargets(input);
}
