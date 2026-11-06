import { REVIEWERS } from "./reviewer-results.mjs";

// After the main thread checks an investigator's answer, a question is
// verified, verified after the one allowed repair, or reported as not
// answerable from the repository.
const STATUSES = Object.freeze(["verified", "repaired", "unanswered"]);

function oneLine(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isReviewerLens(lens) {
  return REVIEWERS.includes(lens);
}

function namesFiles(question) {
  return (
    Array.isArray(question?.files) && question.files.length > 0 && question.files.every((file) => oneLine(file) !== "")
  );
}

function isCompleteQuestion(question) {
  return (
    isReviewerLens(question?.lens) &&
    oneLine(question?.id) !== "" &&
    oneLine(question?.question) !== "" &&
    namesFiles(question) &&
    STATUSES.includes(question?.status)
  );
}

function isCompleteExclusion(excluded) {
  return isReviewerLens(excluded?.lens) && oneLine(excluded?.reason) !== "";
}

// A slot ends the plan with questions or with one exclusion, never both and
// never neither.
function entryKind(entry) {
  const asked = entry.questions !== undefined;
  if (asked === (entry.excluded !== undefined)) {
    throw new Error(
      `Slot ${entry.slot} has ${asked ? "both questions and an exclusion" : "neither questions nor an exclusion"}`,
    );
  }
  return asked ? "questions" : "excluded";
}

const REQUIRE_KIND = {
  excluded(entry) {
    if (!isCompleteExclusion(entry.excluded)) {
      throw new Error(`The exclusion for slot ${entry.slot} needs a reviewer lens and a reason`);
    }
  },
  questions(entry) {
    if (!(Array.isArray(entry.questions) && entry.questions.length > 0)) {
      throw new Error(`Slot ${entry.slot} needs a non-empty questions array`);
    }
  },
};

function requireEntryShape(entry) {
  REQUIRE_KIND[entryKind(entry)](entry);
}

function requireQuestion(question, slot, ids) {
  if (!isCompleteQuestion(question)) {
    throw new Error(
      `Question ${JSON.stringify(question?.id ?? null)} in slot ${slot} ` +
        "needs an id, a reviewer lens, a question, a files list, " +
        `and a status of ${STATUSES.join(", ")}`,
    );
  }
  const id = oneLine(question.id);
  if (ids.has(id)) {
    throw new Error(`Question ${id} appears more than once`);
  }
  ids.add(id);
}

export { oneLine, requireEntryShape, requireQuestion };
