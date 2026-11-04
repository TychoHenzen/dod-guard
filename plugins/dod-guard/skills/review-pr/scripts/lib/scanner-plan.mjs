const FILE_PREFIX = "file:";

function notListProblem(question) {
  return `question ${question.id} has a scanner list that is not an array of S ids`;
}

// A question may name only violations in its own file slot, because a DROP
// may rest only on a question asked about the violation's own file.
function listedProblems(question, slot, byId) {
  const { id } = question;
  return question.scanner.flatMap((s) => {
    const violation = byId.get(s);
    if (!violation) {
      return [`question ${id} lists ${s}, which is not a scanner violation`];
    }
    if (typeof slot !== "string" || !slot.startsWith(FILE_PREFIX)) {
      return [`question ${id} is in slot ${slot}, not a file slot, but lists ${s}`];
    }
    const slotFile = slot.slice(FILE_PREFIX.length);
    if (violation.file !== slotFile) {
      return [`question ${id} lists ${s}, which is in ${violation.file}, not in its slot's file ${slotFile}`];
    }
    return [];
  });
}

function questionProblems(question, slot, byId) {
  if (question?.scanner === undefined) {
    return [];
  }
  const listed = question.scanner;
  if (!(Array.isArray(listed) && listed.every((s) => typeof s === "string"))) {
    return [notListProblem(question)];
  }
  return listedProblems(question, slot, byId);
}

// Returns the value when it is an array, and an empty list otherwise, so a
// malformed plan reports its own problem instead of throwing here.
function arrayOrEmpty(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

// One scanner question per file covers every violation of that file, so a
// slot asks it once and the question names each S id of the file. Only
// questions that passed the checks above are judged here.
function collapseProblems(slot, questions, byId) {
  if (typeof slot !== "string" || !slot.startsWith(FILE_PREFIX)) {
    return [];
  }
  const file = slot.slice(FILE_PREFIX.length);
  const scanning = questions.filter(
    (question) =>
      Array.isArray(question?.scanner) &&
      question.scanner.length > 0 &&
      questionProblems(question, slot, byId).length === 0,
  );
  const problems = [];
  if (scanning.length > 1) {
    problems.push(`slot ${slot} has ${scanning.length} scanner questions; ask one per file`);
  }
  const inFile = [...byId.values()].filter((violation) => violation.file === file).map(({ id }) => id);
  for (const question of scanning) {
    const missing = inFile.filter((id) => !question.scanner.includes(id));
    if (missing.length > 0) {
      problems.push(`question ${question.id} omits ${missing.join(", ")} from ${file}`);
    }
  }
  return problems;
}

// Every scanner list in the plan is checked when the plan is read, so a
// question that names another file's violation is refused before any ruling
// or build relies on it. Plan shape is checked elsewhere; this tolerates a
// malformed plan so it reports its own problem.
function requireScannerQuestions(plan, scanner) {
  const byId = new Map(scanner.map((violation) => [violation.id, violation]));
  const entries = arrayOrEmpty(plan);
  const questionsOf = (entry) => arrayOrEmpty(entry?.questions);
  const listed = entries.flatMap((entry) =>
    questionsOf(entry).flatMap((question) => questionProblems(question, entry?.slot, byId)),
  );
  const collapsed = entries.flatMap((entry) => collapseProblems(entry?.slot, questionsOf(entry), byId));
  const problems = [...listed, ...collapsed];
  if (problems.length > 0) {
    throw new Error(`The review plan's scanner lists are refused; fix the plan: ${problems.join("; ")}`);
  }
}

export { requireScannerQuestions };
