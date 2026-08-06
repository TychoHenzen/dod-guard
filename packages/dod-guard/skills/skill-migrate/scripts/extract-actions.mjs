#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    transcript: { type: "string" },
    out: { type: "string" },
  },
});

if (!values.transcript) {
  process.stderr.write("Usage: extract-actions.mjs --transcript=<path> [--out=<path>]\n");
  process.exit(3);
}

const raw = readFileSync(values.transcript, "utf-8");
const actions = [];
let index = 0;

for (const line of raw.split("\n")) {
  if (!line.trim()) continue;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    continue;
  }

  if (event.type === "assistant") {
    const content = event.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === "tool_use") {
        actions.push({
          index: index++,
          tool: block.name,
          id: block.id,
          args: block.input ?? {},
        });
      }
    }
  }

  if (event.type === "tool_result" || event.type === "result") {
    const last = actions.findLast((a) => a.id === event.tool_use_id);
    if (last) {
      last.exit_code = event.exit_code ?? null;
      last.is_error = event.is_error ?? false;
    }
  }
}

const output = JSON.stringify(actions, null, 2);

if (values.out) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(values.out, output + "\n");
} else {
  process.stdout.write(output + "\n");
}
