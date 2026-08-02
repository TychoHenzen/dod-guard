// Locating transcripts on disk. They live under the Claude Code config
// directory, one folder per project, one file per session, named by session id.

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const DAY_MS = 86_400_000;

export function projectsRoot(args = {}) {
  if (args.projects) {
    return args.projects;
  }
  const config = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
  return join(config, "projects");
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

// Newest first, because a skill is nearly always debugged right after it
// misbehaved. The day window keeps a scan off hundreds of stale sessions.
export function listTranscripts(root, days = 30) {
  if (!existsSync(root)) {
    return [];
  }
  const cutoff = Date.now() - days * DAY_MS;
  return readdirSync(root)
    .flatMap((project) => transcriptsIn(root, project))
    .filter((entry) => entry.modified >= cutoff)
    .sort((left, right) => right.modified - left.modified);
}

// A session id prefix is enough. Nobody types 36 characters of UUID by hand.
export function resolveSession(root, wanted) {
  if (existsSync(wanted)) {
    return { path: wanted, session: basename(wanted, ".jsonl"), project: "" };
  }
  const all = listTranscripts(root, Number.MAX_SAFE_INTEGER);
  return all.find((entry) => entry.session.startsWith(wanted)) ?? null;
}
