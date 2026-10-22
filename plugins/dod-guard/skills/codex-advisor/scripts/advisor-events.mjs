export function jsonEvents(...outputs) {
  const events = [];
  for (const output of outputs) {
    for (const line of output.split(/\r?\n/u)) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // Banners and hook diagnostics share these streams; they are not events.
      }
    }
  }
  return events;
}

function errorItemMessage(event) {
  const isError = event?.type === "item.completed" && event.item?.type === "error";
  return isError && typeof event.item.message === "string" ? event.item.message : undefined;
}

export function modelMetadataFallback(events, model) {
  if (typeof model !== "string") return;
  const prefix = `Model metadata for ${model} not found.`;
  for (const event of events) {
    const message = errorItemMessage(event);
    if (message?.startsWith(prefix) && message.includes("Defaulting to fallback metadata")) {
      return { event, message };
    }
  }
}

// The Codex advisor must behave like Claude's built-in advisor tool: one turn,
// one answer, and no tool use. Reasoning and diagnostic error items are not
// tool use; any other item type, known or not, fails the run.
const ADVICE_ITEM_TYPES = new Set(["agent_message", "reasoning", "error"]);

function turnViolation(events) {
  const turns = events.filter((event) => event?.type === "turn.started").length;
  if (turns !== 1) return `Codex advisor ran ${turns} turns; exactly one is allowed`;
}

function isToolItem(event) {
  return typeof event?.type === "string" && event.type.startsWith("item.") && !ADVICE_ITEM_TYPES.has(event.item?.type);
}

function toolViolation(events) {
  const tool = events.find(isToolItem);
  if (tool) return `Codex advisor used a tool (${tool.item?.type ?? "unknown item"}); its advice is not used`;
}

function answerViolation(events) {
  const isAnswer = (event) => event?.type === "item.completed" && event.item?.type === "agent_message";
  const answers = events.filter(isAnswer).length;
  if (answers !== 1) return `Codex advisor returned ${answers} agent messages; exactly one is allowed`;
}

export function oneTurnViolation(events) {
  return turnViolation(events) ?? toolViolation(events) ?? answerViolation(events);
}
