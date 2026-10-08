import { REVIEWERS } from "./reviewer-results.mjs";

// After the main thread checks an investigator's answer, a planned question is
// verified, verified after the one allowed repair, or reported as not
// answerable from the repository.
const STATUSES = Object.freeze(["verified", "repaired", "unanswered"]);

function oneLine(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// A question that contains HTML could close the details block early.
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function isComplete(entry) {
  return (
    REVIEWERS.includes(entry?.lens) &&
    oneLine(entry?.id) !== "" &&
    oneLine(entry?.question) !== "" &&
    STATUSES.includes(entry?.status)
  );
}

function requireQuestions(questions) {
  if (!Array.isArray(questions)) {
    throw new Error("The review questions must be a JSON array");
  }
  const ids = new Set();
  for (const entry of questions) {
    if (!isComplete(entry)) {
      throw new Error(
        `Review question ${JSON.stringify(entry?.id ?? null)} needs a reviewer lens, an id, a question, ` +
          `and a status of ${STATUSES.join(", ")}`,
      );
    }
    const id = oneLine(entry.id);
    if (ids.has(id)) {
      throw new Error(`Review question ${id} appears more than once`);
    }
    ids.add(id);
  }
  const missing = REVIEWERS.filter((lens) => !questions.some((entry) => entry.lens === lens));
  if (missing.length > 0) {
    throw new Error(`No planned review questions for ${missing.join(", ")}`);
  }
}

function questionsBlock(questions) {
  requireQuestions(questions);
  const lines = ["<details>", `<summary>Planned review questions (${questions.length})</summary>`];
  for (const lens of REVIEWERS) {
    lines.push("", `**${lens}**`, "");
    for (const entry of questions.filter((item) => item.lens === lens)) {
      lines.push(`- ${escapeHtml(oneLine(entry.id))} (${entry.status}): ${escapeHtml(oneLine(entry.question))}`);
    }
  }
  lines.push("", "</details>");
  return lines.join("\n");
}

export { questionsBlock };
