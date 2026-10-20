// The issues a pull request closes, read over REST from its body and commit messages.
import { ghJson, ghJsonArrayPages } from "./gh-runner.mjs";

const NAME_CHARACTERS = "[A-Za-z0-9_.-]+";
const CLOSING_KEYWORD = "\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+";
const CLOSING_TARGET = `(?:(?<repository>${NAME_CHARACTERS}/${NAME_CHARACTERS}))?#(?<number>\\d+)\\b`;
const CLOSING_REFERENCE = new RegExp(CLOSING_KEYWORD + CLOSING_TARGET, "giu");

function closingMatches(text) {
  return String(text ?? "").matchAll(CLOSING_REFERENCE);
}

function referenceOf(match, defaultRepository) {
  return { repository: match.groups.repository ?? defaultRepository, number: Number(match.groups.number) };
}

// Adds the references in text that are not already collected, keyed by repository and number.
function collectClosingReferences(references, text, defaultRepository) {
  for (const match of closingMatches(text)) {
    const reference = referenceOf(match, defaultRepository);
    const key = `${reference.repository}#${reference.number}`;
    if (!references.has(key)) {
      references.set(key, reference);
    }
  }
}

export function readLinkedIssues(repository, pullNumber, commandRunner) {
  const pullEndpoint = `repos/${repository}/pulls/${pullNumber}`;
  const { data: pull } = ghJson(["api", pullEndpoint], [0], commandRunner);
  const references = new Map();
  collectClosingReferences(references, pull?.body, repository);
  for (const commit of ghJsonArrayPages(`${pullEndpoint}/commits?per_page=100`, commandRunner)) {
    collectClosingReferences(references, commit?.commit?.message, repository);
  }
  return [...references.values()].map(({ repository: issueRepository, number }) => {
    const { data: currentIssue } = ghJson(["api", `repos/${issueRepository}/issues/${number}`], [0], commandRunner);
    return {
      number,
      state: currentIssue.state.toUpperCase(),
      url: currentIssue.html_url ?? currentIssue.url,
    };
  });
}
