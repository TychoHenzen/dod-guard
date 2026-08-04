/**
 * Lessons: what an attempt taught, attributed to the branch that learned it.
 *
 * The record store holds them as INSIGHT messages, so a re-init that empties
 * the legacy lessons.jsonl destroys nothing.
 */

import { createHash } from "node:crypto";
import { activeBranch, initializedRoot } from "./evo-git.js";
import { type Message, queryMessages, writeMessage } from "./memory.js";

export function recordLesson(root: string, branch: string, content: string): void {
  writeMessage("INSIGHT", content, { branch, metadata: { source: "evo_learn" } }, root);
}

/**
 * Every lesson, newest first. Ties break on insertion order.
 *
 * Lessons are read by message type alone, never by scope. A lesson written
 * directly and a lesson carried over from the legacy file land under different
 * scopes, and both are lessons.
 */
export function lessonsOf(root: string): Message[] {
  const found = queryMessages({ type: "INSIGHT", limit: 1000 }, root);
  return found.sort((a, b) => (a.timestamp === b.timestamp ? b.id - a.id : b.timestamp.localeCompare(a.timestamp)));
}

export function evo_learn(content: string, repoOverride?: { cwd: string; rootBranch: string }): string {
  const root = initializedRoot(repoOverride?.cwd);
  const branch = activeBranch(root);
  recordLesson(root, branch, content);
  return `Lesson recorded on branch '${branch}'.`;
}

export function evo_lessons(): string {
  const lessons = lessonsOf(initializedRoot());
  if (lessons.length === 0) return "No lessons recorded.";
  return lessons.map((l, i) => `[${i + 1}] ${l.timestamp} (${l.branch}): ${l.content}`).join("\n");
}

export function evo_export_lessons(): string {
  return JSON.stringify(lessonsOf(initializedRoot()).map(toMemoryEntry), null, 2);
}

/** One entry of the obsidian-rag memory_save shape, with a stable id. */
function toMemoryEntry(lesson: Message): Record<string, unknown> {
  const seed = `${lesson.content}|${lesson.branch}|${lesson.timestamp}`;
  return {
    id: `gitevo-${createHash("sha256").update(seed).digest("hex").slice(0, 12)}`,
    title: lesson.content.slice(0, 80),
    description: `GitEvo lesson from branch '${lesson.branch}'`,
    content: lesson.content,
    type: "feedback",
    metadata: { source: "gitevo", branch: lesson.branch, timestamp: lesson.timestamp },
  };
}
