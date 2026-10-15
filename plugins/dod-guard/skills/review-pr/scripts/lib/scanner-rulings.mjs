// A reason meaning pre-existing or unchanged at base is not on this list,
// because accepting it would settle the open scanner scope policy by fiat.
const DROP_REASONS = ["not-at-head", "excluded-path", "rule-misfire"];
const CHECKED = ["verified", "repaired"];

function planQuestions(plan) {
  const questions = plan.flatMap((entry) => entry.questions ?? []);
  return new Map(questions.map((question) => [question.id, question]));
}

function idProblem(id, known, seen) {
  if (!known.has(id)) {
    return `unknown S id ${JSON.stringify(id ?? null)}`;
  }
  if (seen.has(id)) {
    return `duplicate S id ${id}`;
  }
  seen.add(id);
  return null;
}

// A drop must rest on an answer the main thread checked and that was asked
// about this violation, so a pass cannot drop a finding on its own say-so.
function answersFor(question, id) {
  const listed = Array.isArray(question?.scanner) && question.scanner.includes(id);
  return listed && CHECKED.includes(question.status);
}

function answerProblem(id, answer, questions) {
  if (answersFor(questions.get(answer), id)) {
    return null;
  }
  const cited = JSON.stringify(answer ?? null);
  return `${id} DROP cites ${cited}, not a verified or repaired plan question listing ${id}`;
}

function dropProblems(ruling, questions) {
  const ids = ruling.ids.join(", ");
  const reason = JSON.stringify(ruling.reason ?? null);
  const refused = `${ids} DROP reason ${reason} is not one of ${DROP_REASONS.join(", ")}`;
  const reasons = DROP_REASONS.includes(ruling.reason) ? [] : [refused];
  return [...reasons, ...ruling.ids.map((id) => answerProblem(id, ruling.answer, questions))];
}

// A kept violation posts as the scanner reported it, so a reason or answer on
// it would be evidence nothing reads.
function keepProblems(ruling) {
  const extra = ["reason", "answer"].filter((key) => key in ruling);
  return extra.length > 0 ? [`${ruling.ids.join(", ")} KEEP carries ${extra.join(", ")}`] : [];
}

function statusProblems(ruling, questions) {
  if (ruling.status === "DROP") {
    return dropProblems(ruling, questions);
  }
  if (ruling.status === "KEEP") {
    return keepProblems(ruling);
  }
  const status = JSON.stringify(ruling.status ?? null);
  return [`${ruling.ids.join(", ")} has status ${status}, not KEEP or DROP`];
}

function problemsOf(ruling, context) {
  if (!(Array.isArray(ruling?.ids) && ruling.ids.length > 0)) {
    return ["it has no ids"];
  }
  const ids = ruling.ids.map((id) => idProblem(id, context.known, context.seen));
  return [...ids, ...statusProblems(ruling, context.questions)].filter(Boolean);
}

// Every in-scope violation is in exactly one ruling, so a pass cannot drop a
// violation by leaving it out or rule on it twice.
function rulingProblems(rulings, { scanner, plan }) {
  const known = new Set(scanner.map(({ id }) => id));
  const context = { known, seen: new Set(), questions: planQuestions(plan) };
  const labelled = (ruling, index) => {
    const label = `ruling ${index + 1}: `;
    return problemsOf(ruling, context).map((text) => label + text);
  };
  const problems = rulings.flatMap(labelled);
  const missing = scanner.filter(({ id }) => !context.seen.has(id));
  return [...problems, ...missing.map(({ id }) => `missing S id ${id}: it is in no ruling`)];
}

// Splits the violations, in S order, by their ruling. Call only after the
// rulings pass rulingProblems.
function splitRulings(rulings, scanner) {
  const ruled = new Map(rulings.flatMap((ruling) => ruling.ids.map((id) => [id, ruling])));
  const kept = scanner.filter(({ id }) => ruled.get(id).status === "KEEP");
  const dropped = scanner
    .filter(({ id }) => ruled.get(id).status === "DROP")
    .map((violation) => {
      const { reason, answer } = ruled.get(violation.id);
      return { ...violation, reason, answer };
    });
  return { kept, dropped };
}

export { rulingProblems, splitRulings };
