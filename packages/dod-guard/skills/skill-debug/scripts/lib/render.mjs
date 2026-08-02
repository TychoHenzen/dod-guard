// Output shape. A reader takes this trace and aligns it against a SKILL.md.
// The step number is what every finding then cites.

const KIND_TAG = {
  tool: "tool  ",
  result: "  ->  ",
  user: "USER  ",
  say: "say   ",
  load: "load  ",
};

const NAMED = new Set(["tool", "result"]);

function when(timestamp) {
  if (!timestamp) {
    return "unknown time";
  }
  return String(timestamp).replace("T", " ").slice(0, 16);
}

function stepLine(step, index) {
  const number = String(index + 1).padStart(4, " ");
  const tag = KIND_TAG[step.kind] ?? step.kind;
  const name = NAMED.has(step.kind) ? `${step.name} ` : "";
  const mark = step.sidechain ? "~" : " ";
  return `${number}${mark} ${tag} ${name}${step.detail}`;
}

function headOf(run, counts) {
  return [
    `skill ${run.name}  form ${run.form}  args ${run.args || "(none)"}`,
    `started ${when(run.timestamp)}  records ${run.start}..${run.end}`,
    `boundary: run ends at ${run.boundary}`,
    `steps ${counts.steps}  tool calls ${counts.tools}` +
      `  errors ${counts.errors}  user turns ${counts.users}` +
      `  agents ${counts.agents}`,
    "",
  ];
}

export function renderTrace(run, trace) {
  const head = headOf(run, trace.counts);
  const body = trace.steps.map(stepLine);
  const more = "trace truncated. Raise --max-steps to see the rest.";
  const tail = trace.truncated ? ["", more] : [];
  return [...head, ...body, ...tail].join("\n");
}

function indexLine(row, index) {
  const number = String(index + 1).padEnd(4, " ");
  const session = row.session.slice(0, 8);
  const { steps, users, errors } = row.counts;
  const counts = `${steps} steps, ${users} user, ${errors} err`;
  return [
    `${number} ${when(row.timestamp)}  ${session}  ${row.project}`,
    `       ${counts}`,
  ].join("\n");
}

export function renderRunIndex(rows) {
  return rows.map(indexLine).join("\n");
}
