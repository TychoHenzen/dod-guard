// inject-memories.js — SessionStart hook: auto-inject project-relevant
// memories from Obsidian vault, replacing Claude's built-in memory system.
//
// Reads Claude-Memories/ from the vault, detects current project from CWD,
// filters memories by project metadata or keyword match, outputs context
// that gets injected into the session.

import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";

const VAULT_MEMORIES = "C:/Obsidian/Claude/Claude-Memories";

// ── Project detection ──────────────────────────────────────────────────

function detectProject() {
  const cwd = process.cwd();
  const known = {
    "dod-guard": "dod-guard",
    "ClaudeControl": "claude-control",
    "WavReconstruction": "wavrecon",
    "AMP-Website": "amp-website",
    "Axiom2d": "axiom2d",
    "RME": "rme",
    "usageTracker": "usage-tracker",
  };
  for (const [dir, slug] of Object.entries(known)) {
    if (cwd.includes(dir)) return slug;
  }
  return basename(cwd).toLowerCase();
}

// ── Simple frontmatter parser (no gray-matter dependency in plugin cache) ──

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };
  const data = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      let val = kv[2].trim();
      if (val === "true") val = true;
      else if (val === "false") val = false;
      data[key] = val;
    }
  }
  return { data, content: match[2].trim() };
}

// ── Memory scoring ─────────────────────────────────────────────────────

function scoreMemory(entry, project) {
  let score = 0;

  // Exact project match in frontmatter
  if (entry.data.project === project) score += 10;

  // Project name in description
  if (entry.data.description && String(entry.data.description).toLowerCase().includes(project)) {
    score += 5;
  }

  // Project name in content
  if (entry.content.toLowerCase().includes(project)) score += 3;

  // Project in filename
  if (entry.file.toLowerCase().includes(project.replace(/-/g, ""))) score += 4;

  // Global memories (user/feedback type) — always base relevance
  const type = entry.data.type;
  if (type === "user" || type === "feedback") score += 1;

  return score;
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(VAULT_MEMORIES)) return;

  const project = detectProject();
  if (!project) return;

  const files = await readdir(VAULT_MEMORIES);
  const mdFiles = files.filter(f => f.endsWith(".md"));
  if (mdFiles.length === 0) return;

  const entries = [];

  for (const file of mdFiles) {
    const raw = await readFile(join(VAULT_MEMORIES, file), "utf-8");
    const { data, content } = parseFrontmatter(raw);
    const score = scoreMemory({ data, content, file }, project);
    if (score > 0) {
      entries.push({ data, content, file, score });
    }
  }

  if (entries.length === 0) return;

  entries.sort((a, b) => b.score - a.score);
  const top = entries.slice(0, 15);

  const lines = [];
  lines.push("[obsidian-rag memory injection]");
  for (const e of top) {
    const title = e.data.name || e.file.replace(".md", "");
    const type = e.data.type || "reference";
    const desc = e.data.description || "";
    const snippet = e.content.length > 300 ? e.content.slice(0, 300) + "..." : e.content;
    lines.push(`- **${title}** [${type}]${desc ? " — " + desc : ""}`);
    lines.push(`  ${snippet.replace(/\n/g, " ")}`);
  }

  process.stdout.write(lines.join("\n"));
}

main().catch(err => {
  console.error("[obsidian-rag] memory injection failed:", err.message);
});
