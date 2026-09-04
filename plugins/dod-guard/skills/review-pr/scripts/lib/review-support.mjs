// biome-ignore lint/correctness/noNodejsModules: This skill helper runs under Node.js.
import { writeFileSync } from "node:fs";

const GITHUB_PULL_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/i;
const GITHUB_PULL_NUMBER = /^#(\d+)$/;
const AZURE_PULL_URL =
  /^https:\/\/(?:dev\.azure\.com\/([^/]+)|([^.]+)\.visualstudio\.com)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)\/?$/i;
const AZURE_PULL_NUMBER = /^(?:ado:)?(\d+)$/i;
const HTML_BREAK = /<br\s*\/?>/gi;
const HTML_PARAGRAPH_END = /<\/p>/gi;
const HTML_TEXT_ENTITY = /&(nbsp|amp|lt|gt|quot|#39);/gi;
const MANY_NEWLINES = /\n{3,}/g;
const AUTHORIZATION_SECRET = /\b(Authorization\s*:\s*(?:Bearer|Basic)\s+)[^\s"']+/gi;
const GITHUB_SECRET = /\b(gh[pousr]_)[A-Za-z0-9_]{8,}\b/g;
const QUERY_SECRET = /([?&](?:access_token|api[_-]?key|pat|sig|token)=)[^&#\s]+/gi;
const ENVIRONMENT_SECRET = /\b((?:AZURE_DEVOPS_EXT_PAT|AZURE_DEVOPS_PAT|GITHUB_TOKEN)\s*=\s*)[^\s"']+/gi;
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const NEWLINE = /\r?\n/;
const B_PATH_PREFIX = /^b\//;
const DIFF_FILE_PREFIX_LENGTH = 4;
const BLOCKER_RANK = 3;
const MAJOR_RANK = 2;
const MINOR_RANK = 1;
const HTML_TEXT_ENTITIES = Object.freeze({
  "#39": "'",
  amp: "&",
  gt: "&gt;",
  lt: "&lt;",
  nbsp: " ",
  quot: '"',
});

function stop(message) {
  throw new Error(message);
}

function normalizeReviewTarget(input, currentBranch) {
  const value = input.trim();
  if (!value) {
    if (!currentBranch) {
      stop("The current branch could not be resolved.");
    }
    return { provider: "git", ref: currentBranch, source: "current-branch" };
  }

  const github = value.match(GITHUB_PULL_URL);
  if (github) {
    return { owner: github[1], provider: "github", pullNumber: Number(github[3]), repository: github[2] };
  }
  const githubNumber = value.match(GITHUB_PULL_NUMBER);
  if (githubNumber) {
    return { provider: "github", pullNumber: Number(githubNumber[1]) };
  }

  const azure = value.match(AZURE_PULL_URL);
  if (azure) {
    return {
      organization: azure[1] ?? azure[2],
      project: decodeURIComponent(azure[3]),
      provider: "azure",
      pullNumber: Number(azure[5]),
      repository: decodeURIComponent(azure[4]),
    };
  }
  const azureNumber = value.match(AZURE_PULL_NUMBER);
  if (azureNumber) {
    return { provider: "azure", pullNumber: Number(azureNumber[1]) };
  }

  return { provider: "git", ref: value, source: "named-ref" };
}

function removeHtmlTags(value) {
  const text = [];
  let insideTag = false;
  for (const character of value) {
    if (character === "<") {
      insideTag = true;
    } else if (character === ">" && insideTag) {
      insideTag = false;
    } else if (!insideTag) {
      text.push(character);
    }
  }
  return text.join("");
}

function stripHtml(value = "") {
  return removeHtmlTags(value.replace(HTML_BREAK, "\n").replace(HTML_PARAGRAPH_END, "\n"))
    .replace(HTML_TEXT_ENTITY, (entity) => HTML_TEXT_ENTITIES[entity.slice(1, -1).toLowerCase()])
    .replace(MANY_NEWLINES, "\n\n")
    .trim();
}

function section(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "im"))?.[1].trim() ?? "";
}

function normalizeGitHubHierarchy(issue) {
  return {
    acceptanceCriteria: section(issue.body ?? "", "Acceptance criteria"),
    body: issue.body ?? "",
    number: issue.number,
    title: issue.title,
    url: issue.url,
    workItems: (issue.subIssues?.nodes ?? issue.subIssues ?? []).map((child) => ({
      body: child.body ?? "",
      number: child.number,
      state: child.state,
      title: child.title,
      url: child.url,
    })),
  };
}

function normalizeAzureHierarchy(parent, children = []) {
  const fields = parent.fields ?? {};
  return {
    acceptanceCriteria: stripHtml(fields["Microsoft.VSTS.Common.AcceptanceCriteria"] ?? ""),
    body: stripHtml(fields["System.Description"] ?? ""),
    number: parent.id,
    title: fields["System.Title"] ?? "",
    url: parent._links?.html?.href ?? parent.url,
    workItems: children.map((child) => ({
      body: stripHtml(child.fields?.["System.Description"] ?? ""),
      number: child.id,
      state: child.fields?.["System.State"] ?? "",
      title: child.fields?.["System.Title"] ?? "",
      url: child._links?.html?.href ?? child.url,
    })),
  };
}

function redactString(value) {
  return value
    .replace(AUTHORIZATION_SECRET, "$1[REDACTED]")
    .replace(GITHUB_SECRET, "$1[REDACTED]")
    .replace(QUERY_SECRET, "$1[REDACTED]")
    .replace(ENVIRONMENT_SECRET, "$1[REDACTED]");
}

function redactSecrets(value) {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSecrets(item)]));
  }
  return value;
}

function selectDiffFile(line, changed) {
  const name = line.slice(DIFF_FILE_PREFIX_LENGTH);
  if (name === "/dev/null") {
    return;
  }
  const file = name.replace(B_PATH_PREFIX, "");
  if (!changed.has(file)) {
    changed.set(file, new Set());
  }
  return file;
}

function recordDiffLine(state, line, changed) {
  if (line.startsWith("+++ ")) {
    state.file = selectDiffFile(line, changed);
  } else {
    const hunk = line.match(HUNK_HEADER);
    if (hunk) {
      state.finalLine = Number(hunk[1]);
    } else if (state.file && !line.startsWith("--- ")) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        changed.get(state.file).add(state.finalLine);
        state.finalLine += 1;
      } else if (!(line.startsWith("-") || line.startsWith("\\"))) {
        state.finalLine += 1;
      }
    }
  }
}

function parseChangedLines(diff) {
  const changed = new Map();
  const state = { file: undefined, finalLine: 0 };
  for (const line of diff.split(NEWLINE)) {
    recordDiffLine(state, line, changed);
  }
  return changed;
}

function validateFindingLines(findings, diff, allowPullRequestLevel = false) {
  const changed = parseChangedLines(diff);
  const accepted = [];
  const rejected = [];
  for (const finding of findings) {
    if (finding.location === "pull-request" && allowPullRequestLevel && !finding.file && !finding.line) {
      accepted.push(finding);
    } else if (
      typeof finding.file === "string" &&
      Number.isInteger(finding.line) &&
      changed.get(finding.file)?.has(finding.line)
    ) {
      accepted.push(finding);
    } else {
      rejected.push({ ...finding, rejection: "Finding does not identify a changed final-state line." });
    }
  }
  return { accepted, rejected };
}

function findingKey(finding) {
  return (finding.rootCause ?? `${finding.file}:${finding.line}:${finding.problem}`)
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, " ")
    .trim();
}

function severityRank(severity) {
  if (severity === "BLOCKER") {
    return BLOCKER_RANK;
  }
  if (severity === "MAJOR") {
    return MAJOR_RANK;
  }
  if (severity === "MINOR") {
    return MINOR_RANK;
  }
  return 0;
}

function dedupeFindings(findings) {
  const byRootCause = new Map();
  for (const finding of findings) {
    const key = findingKey(finding);
    const existing = byRootCause.get(key);
    if (!existing || severityRank(finding.severity) > severityRank(existing.severity)) {
      byRootCause.set(key, finding);
    }
  }
  return [...byRootCause.values()];
}

function renderAzureReport(context, findings) {
  const lines = [
    `# Azure DevOps PR ${context.pullNumber} review`,
    "",
    `- Repository: ${context.repository}`,
    `- Target: ${context.targetRef}`,
    `- Head: ${context.headSha}`,
    `- PBI: ${context.workItem?.number ?? "unlinked"} ${context.workItem?.title ?? ""}`.trimEnd(),
    "",
    "## Findings",
    "",
  ];
  if (findings.length === 0) {
    lines.push("No actionable findings were found.", "");
  } else {
    for (const [index, finding] of findings.entries()) {
      lines.push(
        `### ADO-${context.pullNumber}-${index + 1}: ${finding.severity} ${finding.problem}`,
        "",
        `- Location: \`${finding.file}:${finding.line}\``,
        `- Impact: ${finding.impact}`,
        `- Requirement: ${finding.requirement}`,
        `- Correction: ${finding.correction}`,
        `- Root cause: ${finding.rootCause}`,
        "- Status: Open",
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function writeAzureReport(path, context, findings) {
  writeFileSync(path, renderAzureReport(context, findings), "utf8");
}

export {
  dedupeFindings,
  normalizeAzureHierarchy,
  normalizeGitHubHierarchy,
  normalizeReviewTarget,
  parseChangedLines,
  redactSecrets,
  renderAzureReport,
  validateFindingLines,
  writeAzureReport,
};
