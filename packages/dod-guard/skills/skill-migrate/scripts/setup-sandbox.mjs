#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const { values } = parseArgs({
  options: {
    case: { type: "string" },
    out: { type: "string" },
  },
});

if (!values.case) {
  process.stderr.write("Usage: setup-sandbox.mjs --case=<path-to-case.json> [--out=<dir>]\n");
  process.exit(3);
}

const evalCase = JSON.parse(readFileSync(values.case, "utf-8"));
const sandboxDir =
  values.out || join(tmpdir(), `skill-migrate-${evalCase.id}-${randomBytes(4).toString("hex")}`);

mkdirSync(sandboxDir, { recursive: true });

const fixtures = evalCase.fixtures?.files ?? {};
for (const [relPath, source] of Object.entries(fixtures)) {
  const dest = join(sandboxDir, relPath);
  mkdirSync(dirname(dest), { recursive: true });

  if (typeof source === "string" && source.startsWith("copy:")) {
    const srcPath = source.slice(5);
    if (existsSync(srcPath)) {
      cpSync(srcPath, dest);
    } else {
      writeFileSync(dest, `# placeholder: source not found: ${srcPath}\n`);
    }
  } else if (typeof source === "string" && source.startsWith("inline:")) {
    writeFileSync(dest, source.slice(7));
  } else if (typeof source === "object" && source.content) {
    writeFileSync(dest, source.content);
  } else {
    writeFileSync(dest, typeof source === "string" ? source : JSON.stringify(source, null, 2));
  }
}

execSync("git init", { cwd: sandboxDir, stdio: "ignore" });
execSync("git add -A", { cwd: sandboxDir, stdio: "ignore" });
execSync('git commit -m "seed" --allow-empty', { cwd: sandboxDir, stdio: "ignore" });

if (evalCase.skill_path) {
  const commandsDir = join(sandboxDir, ".claude", "commands");
  mkdirSync(commandsDir, { recursive: true });
  const skillContent = readFileSync(evalCase.skill_path, "utf-8");
  const skillName = basename(dirname(evalCase.skill_path));
  writeFileSync(join(commandsDir, `${skillName}.md`), skillContent);
}

process.stdout.write(sandboxDir + "\n");
