function present(value) {
  return typeof value === "string" && value.trim() !== "";
}

function answeredProblem(answer) {
  if (!present(answer.path)) {
    return "answered without a path";
  }
  if (!(Number.isInteger(answer.line) && answer.line > 0)) {
    return "answered without a line above 0";
  }
  return present(answer.fact) ? null : "answered without a fact";
}

function answerProblem(answer) {
  if (answer.status === "answered") {
    return answeredProblem(answer);
  }
  if (answer.status === "unanswered") {
    return present(answer.searched) ? null : "unanswered without searched";
  }
  return `unknown status ${JSON.stringify(answer.status ?? null)}`;
}

// Indexes the answers by id and reports an id that appears twice.
function indexAnswers(answers) {
  const byId = new Map();
  const problems = [];
  for (const answer of answers) {
    if (byId.has(answer?.id)) {
      problems.push(`duplicate answer for ${answer.id}`);
    }
    byId.set(answer?.id, answer);
  }
  return { byId, problems };
}

function strayProblems(byId, questions) {
  const wanted = new Set(questions.map((q) => q.id));
  return [...byId.keys()]
    .filter((id) => !wanted.has(id))
    .map((id) => `answer for ${JSON.stringify(id ?? null)} is not a question of this batch`);
}

function questionProblems(question, answer) {
  if (!answer) {
    return [`missing answer for ${question.id}`];
  }
  const problems = [];
  if (answer.slot !== question.slot) {
    const named = JSON.stringify(answer.slot ?? null);
    problems.push(`${question.id} names slot ${named}, expected ${question.slot}`);
  }
  const problem = answerProblem(answer);
  if (problem) {
    problems.push(`${question.id}: ${problem}`);
  }
  return problems;
}

function coverageProblems(batch, answers) {
  const { byId, problems } = indexAnswers(answers);
  return [
    ...problems,
    ...strayProblems(byId, batch.questions),
    ...batch.questions.flatMap((question) => questionProblems(question, byId.get(question.id))),
  ];
}

export { coverageProblems };
