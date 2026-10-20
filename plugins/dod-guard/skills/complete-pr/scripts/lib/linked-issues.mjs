// The issues a pull request closes, read over REST from its body and commit messages.
import { ghJson, ghJsonArrayPages } from "./gh-runner.mjs";

const CLOSING_REFERENCE =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:(?<repository>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#(?<number>\d+)\b/giu;

function closingIssueReferences(text, defaultRepository) {
  const references = new Map();
  for (const match of String(text ?? "").matchAll(CLOSING_REFERENCE)) {
    const repository = match.groups.repository ?? defaultRepository;
    const number = Number(match.groups.number);
    const key = `${repository}#${number}`;
    if (!references.has(key)) {
      references.set(key, { repository, number });
    }
  }
  return [...references.values()];
}

export function readLinkedIssues(repository, pullNumber, commandRunner) {
  const pullEndpoint = `repos/${repository}/pulls/${pullNumber}`;
  const { data: pull } = ghJson(["api", pullEndpoint], [0], commandRunner);
  const references = closingIssueReferences(pull?.body, repository);
  for (const commit of ghJsonArrayPages(`${pullEndpoint}/commits?per_page=100`, commandRunner)) {
    for (const reference of closingIssueReferences(commit?.commit?.message, repository)) {
      if (
        !references.some(
          (candidate) => candidate.repository === reference.repository && candidate.number === reference.number,
        )
      ) {
        references.push(reference);
      }
    }
  }
  return references.map(({ repository: issueRepository, number }) => {
    const { data: currentIssue } = ghJson(["api", `repos/${issueRepository}/issues/${number}`], [0], commandRunner);
    return {
      number,
      state: currentIssue.state.toUpperCase(),
      url: currentIssue.html_url ?? currentIssue.url,
    };
  });
}
