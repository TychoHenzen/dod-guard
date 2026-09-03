// Turning a transcript record into one line.
//
// A run of a long skill is several megabytes. Reading it whole to find out why
// the skill misbehaved costs more context than the skill did. So each record
// collapses to a kind, a name and a short detail. Four kinds carry the whole
// diagnosis: what the agent ran, what came back, what it said, and what the
// user said to it.
//
// User turns are kept longest on purpose. A correction the user typed mid-run
// is the strongest evidence available about where the skill text failed.

import { digest, LIMIT, shorten } from "./digest.mjs";

function resultText(block) {
  const { content } = block;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text ?? "").join(" ");
  }
  return String(content ?? "");
}

// A system reminder is harness output, not something the user typed. Left in,
// it drowns the real interjections, which are the point of keeping user turns.
function userSay(text) {
  const stripped = String(text ?? "")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<local-command-[\s\S]*?>/g, "")
    .replace(/<command-[a-z]+>[\s\S]*?<\/command-[a-z]+>/g, "")
    .trim();
  return stripped ? shorten(stripped, LIMIT.user) : null;
}

function toolStep(block) {
  const detail = digest(block.name, block.input);
  return { kind: "tool", name: block.name, detail };
}

function resultStep(block) {
  const ok = block.is_error !== true;
  const detail = shorten(resultText(block), LIMIT.result);
  return { kind: "result", name: ok ? "ok" : "ERR", detail, ok };
}

function blockToStep(block) {
  if (block?.type === "tool_use") {
    return toolStep(block);
  }
  if (block?.type === "tool_result") {
    return resultStep(block);
  }
  if (block?.type === "text") {
    return { kind: "text", detail: block.text ?? "" };
  }
  return null;
}

// The skill body arrives as a user turn. Printed in full it repeats the very
// file under debate, and counted as a user turn it hides the real ones.
const SKILL_BODY = /^Base directory for this skill:/;

function userStep(text) {
  const detail = userSay(text);
  if (!detail) {
    return null;
  }
  if (SKILL_BODY.test(detail)) {
    return { kind: "load", name: "", detail: "skill body loaded" };
  }
  return { kind: "user", name: "", detail };
}

function finishTextStep(step, record) {
  if (record.type === "assistant") {
    const detail = shorten(step.detail, LIMIT.say);
    return detail ? { kind: "say", name: "", detail } : null;
  }
  return userStep(step.detail);
}

function blocksOf(record) {
  const content = record?.message?.content;
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return Array.isArray(content) ? content : [];
}

export function stepsOf(record) {
  const sidechain = record?.isSidechain === true;
  return blocksOf(record)
    .map(blockToStep)
    .map((step) =>
      step?.kind === "text" ? finishTextStep(step, record) : step,
    )
    .filter(Boolean)
    .map((step) => ({ ...step, sidechain }));
}
