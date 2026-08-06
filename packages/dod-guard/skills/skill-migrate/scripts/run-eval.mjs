#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    sandbox: { type: "string" },
    prompt: { type: "string" },
    skill: { type: "string" },
    model: { type: "string" },
    out: { type: "string" },
  },
});

if (!values.sandbox || !values.prompt) {
  process.stderr.write(
    "Usage: run-eval.mjs --sandbox=<dir> --prompt=<text> [--skill=<path>] [--model=<id>] [--out=<dir>]\n"
  );
  process.exit(3);
}

if (values.skill) {
  const commandsDir = join(values.sandbox, ".claude", "commands");
  mkdirSync(commandsDir, { recursive: true });
  const skillContent = readFileSync(values.skill, "utf-8");
  const skillName = basename(dirname(values.skill));
  writeFileSync(join(commandsDir, `${skillName}.md`), skillContent);
}

const cmd = ["claude", "-p", values.prompt, "--output-format", "stream-json"];
if (values.model) cmd.push("--model", values.model);

const env = {};
for (const [k, v] of Object.entries(process.env)) {
  if (k !== "CLAUDECODE") env[k] = v;
}

const startTime = Date.now();
const chunks = [];

const child = spawn(cmd[0], cmd.slice(1), {
  cwd: values.sandbox,
  env,
  stdio: ["ignore", "pipe", "ignore"],
});

child.stdout.on("data", (chunk) => chunks.push(chunk));

child.on("close", (code) => {
  const duration = Date.now() - startTime;
  const transcript = Buffer.concat(chunks).toString("utf-8");

  let totalTokens = 0;
  for (const line of transcript.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "result" && event.usage) {
        totalTokens = (event.usage.input_tokens ?? 0) + (event.usage.output_tokens ?? 0);
      }
    } catch {
      // skip malformed lines
    }
  }

  const outDir = values.out || values.sandbox;
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "transcript.jsonl"), transcript);
  writeFileSync(
    join(outDir, "timing.json"),
    JSON.stringify(
      {
        total_tokens: totalTokens,
        duration_ms: duration,
        total_duration_seconds: duration / 1000,
        exit_code: code,
      },
      null,
      2
    ) + "\n"
  );

  process.exit(code === 0 ? 0 : 1);
});
