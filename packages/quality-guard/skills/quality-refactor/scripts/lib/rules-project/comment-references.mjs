import { missingConfig } from "./reference-config.mjs";
import { missingSee } from "./reference-target.mjs";

const SEE_TAG = /^@see\s+([^\s#]+)(?:#([A-Za-z_$][\w$]*))?\s*$/i;
const CONFIG_TAG = /^@config\s+([^\s:]+):([A-Za-z_][\w.-]*)\s*$/i;

function commentFinding({ file, config, line, message }) {
  return {
    file,
    line,
    rule: "comment-missing-reference",
    severity: config.presence["comment-missing-reference"],
    message,
    metric: 1,
  };
}

function commentBodies(comment) {
  return comment.text.split(/\r?\n/).map((line, offset) => ({
    body: line.replace(/^[\s/*#]+|[\s*/]+$/g, "").trim(),
    line: comment.line + offset,
  }));
}

function seeViolation({ file, config, item, context }) {
  const see = SEE_TAG.exec(item.body);
  if (!see || !missingSee({ target: see[1], symbol: see[2], ...context }))
    return null;
  return commentFinding({
    file,
    config,
    line: item.line,
    message: `comment references missing repository target: ${see[1]}`,
  });
}

function configViolation({ file, config, item, context }) {
  const configTag = CONFIG_TAG.exec(item.body);
  if (
    !configTag ||
    !missingConfig({ target: configTag[1], key: configTag[2], ...context })
  )
    return null;
  return commentFinding({
    file,
    config,
    line: item.line,
    message: `comment references missing configuration key: ${configTag[2]}`,
  });
}

function commentItemViolation(input) {
  return seeViolation(input) ?? configViolation(input);
}

function commentViolations({ file, config, comment, context }) {
  return commentBodies(comment)
    .map((item) => commentItemViolation({ file, config, item, context }))
    .filter(Boolean);
}

export function checkCommentReferences({ root, files, scans, config }) {
  const violations = [];
  const cache = { targets: new Map(), results: new Map() };
  const context = { root, files, cache };
  for (const file of files)
    for (const comment of scans.get(file.rel)?.comments ?? [])
      violations.push(...commentViolations({ file, config, comment, context }));
  return violations;
}
