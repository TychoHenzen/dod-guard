// Locate Claude and Codex transcripts without making either runtime a prerequisite.

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const DAY_MS = 86_400_000;
const CLAUDE_ROOT = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
const CODEX_ROOT = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");
const DEFAULT_ROOT = existsSync(CLAUDE_ROOT) ? CLAUDE_ROOT : CODEX_ROOT;

export function projectsRoot(args = {}) {
  const explicit = args.projects ?? process.env.SKILL_DEBUG_TRANSCRIPTS;
  if (explicit) return explicit;
  return DEFAULT_ROOT;
}

function transcriptsIn(root, project) {
  const dir = join(root, project);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => ({
      path: join(dir, name),
      session: basename(name, ".jsonl"),
      project,
      modified: statSync(join(dir, name)).mtimeMs,
    }));
}

function codexTranscripts(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((day) => readdirSync(join(root, day.name))
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => ({ path: join(root, day.name, name), session: basename(name, ".jsonl"), project: day.name, modified: statSync(join(root, day.name, name)).mtimeMs })));
}

// Newest first, because a skill is nearly always debugged right after it
// misbehaved. The day window keeps a scan off hundreds of stale sessions.
export function listTranscripts(root, days = 30) {
  if (!existsSync(root)) {
    return [];
  }
  const cutoff = Date.now() - days * DAY_MS;
  const entries = transcriptEntries(root);
  return entries
    .filter((entry) => entry.modified >= cutoff)
    .sort((left, right) => right.modified - left.modified);
}

function transcriptEntries(root) {
  const loaders = { projects: claudeTranscripts, sessions: codexTranscripts };
  const extras = { projects: () => codexTranscripts(CODEX_ROOT), sessions: () => [] };
  const load = loaders[basename(root)] ?? claudeTranscripts;
  const extra = extras[basename(root)] ?? (() => []);
  return load(root).concat(extra());
}

function claudeTranscripts(root) {
  return readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .flatMap((project) => transcriptsIn(root, project));
}

// A session id prefix is enough. Nobody types 36 characters of UUID by hand.
export function resolveSession(root, wanted) {
  if (existsSync(wanted)) {
    return { path: wanted, session: basename(wanted, ".jsonl"), project: "" };
  }
  const all = listTranscripts(root, Number.MAX_SAFE_INTEGER);
  return all.find((entry) => entry.session.startsWith(wanted)) ?? null;
}
