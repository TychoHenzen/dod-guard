// Finding where a skill started. Two forms reach the transcript and they look
// nothing alike. The user typing /tighten leaves a <command-name> tag in a user
// message. The model choosing the skill leaves a Skill tool call.
//
// Both are the same event for this purpose, so both come back the same shape.

const COMMAND_TAG = /<command-name>\/?([^<]+)<\/command-name>/;

// A skill answers to its bare name and to its plugin-qualified name. Somebody
// debugging /tighten should not have to remember it ships as dod-guard:tighten.
export function normalizeSkill(name) {
  return String(name ?? "")
    .trim()
    .replace(/^\//, "")
    .split(":")
    .pop();
}

export function skillMatches(candidate, wanted) {
  if (!candidate) {
    return false;
  }
  return normalizeSkill(candidate) === normalizeSkill(wanted);
}

function textOf(record) {
  const content = record?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((block) => block?.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
}

function commandInvocation(record) {
  const match = COMMAND_TAG.exec(textOf(record));
  if (!match) {
    return null;
  }
  return { name: match[1].trim(), args: "", form: "command" };
}

function toolInvocation(record) {
  const content = record?.message?.content;
  if (!Array.isArray(content)) {
    return null;
  }
  const call = content.find(
    (block) => block?.type === "tool_use" && block.name === "Skill",
  );
  if (!call) {
    return null;
  }
  const input = call.input ?? {};
  return { name: input.skill ?? "", args: input.args ?? "", form: "tool" };
}

function invocationAt(record) {
  if (record?.type === "user") {
    return commandInvocation(record);
  }
  if (record?.type === "assistant") {
    return toolInvocation(record);
  }
  return null;
}

export function findInvocations(records) {
  const found = [];
  records.forEach((record, index) => {
    const invocation = invocationAt(record);
    if (invocation?.name) {
      found.push({ ...invocation, index, timestamp: record.timestamp ?? null });
    }
  });
  return found;
}
