// Flags a planned acceptance row that a Godot project cannot check headless: its proof or expected text asks for a
// window, a screenshot, or a manual run. Pure. The CLI decides that the checkout is a Godot project (a project.godot
// at its root) and passes the rows only then, so every other repository is never judged by it.

// A negated phrase ("no screenshot", "not a manual run") restates the headless rule, so it is not a request.
const NOT_NEGATED = "(?<!\\b(?:no|not|never|without)\\s+(?:an?\\s+)?)";

const ASKS = [
  ["a windowed run", "\\bwindowed\\b"],
  ["a screenshot", "\\bscreenshots?\\b"],
  ["a manual run", "\\bmanual(?:ly)?\\s+(?:run|check|play|test|verif|inspect)\\w*"],
  ["an opened window", "\\b(?:opens?|opening|launch(?:es|ing)?)\\s+(?:a|the)\\s+(?:game\\s+)?window\\b"],
  ["a movie capture", "--write-movie\\b"],
].map(([label, source]) => ({ label, pattern: new RegExp(NOT_NEGATED + source, "i") }));

function rowText(row) {
  return [row.proof, row.expected].filter((part) => typeof part === "string").join("\n");
}

function asksIn(text) {
  return ASKS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}

function rowRemainder(row) {
  if (!row || typeof row !== "object" || row.status === "inapplicable") return [];
  const asks = asksIn(rowText(row));
  if (asks.length === 0) return [];
  const fix = "make it checkable headless, or move the judgement to an owner note";
  return [`planned acceptance row ${row.id} asks for ${asks.join(" and ")} in a Godot project; ${fix}`];
}

function godotWindowRemainder(rows) {
  return Array.isArray(rows) ? rows.flatMap(rowRemainder) : [];
}

export { godotWindowRemainder };
