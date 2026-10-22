import {
  commandResult,
  formValues,
  issueRecord,
} from "./lifecycle-replies.mjs";

export function subIssuesRoute(state, { args, method }, suffix) {
  const parentNumber = Number(suffix.slice(0, -"/sub_issues".length));
  if (method === "POST") {
    const childId = Number(formValues(args, "sub_issue_id=")[0]);
    const child = [...state.issues.values()].find(
      (issue) => issue.id === childId,
    );
    if (!child) throw new Error(`Unknown child issue ${childId}.`);
    child.parent = parentNumber;
    state.issues.get(parentNumber).children.push(child.number);
  }
  const children = state.issues.get(parentNumber).children;
  return commandResult(
    children.map((number) => issueRecord(state.issues.get(number))),
  );
}

export function issueRoute(state, { args, method }, suffix) {
  const issueNumber = Number(suffix);
  const issue = state.issues.get(issueNumber);
  if (!issue) throw new Error(`Unknown issue ${issueNumber}.`);
  if (method === "PATCH") {
    const labels = formValues(args, "labels[]=");
    if (labels.length > 0) issue.labels = labels;
    const nextState = formValues(args, "state=")[0];
    if (nextState) issue.state = nextState;
  }
  return commandResult(issueRecord(issue));
}
