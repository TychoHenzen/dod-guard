const AZURE_FINDING_HEADING = /^###\s+(ADO-\d+-\d+):\s+(BLOCKER|MAJOR|MINOR)\s+(.+)$/gm;
const FIELD_LINE = /^- ([A-Za-z ]+):\s*(.*)$/gm;
const AUTHORIZATION_SECRET = /\b(Authorization\s*:\s*(?:Bearer|Basic)\s+)[^\s"']+/gi;
const GITHUB_SECRET = /\b(gh[pousr]_)[A-Za-z0-9_]{8,}\b/g;
const QUERY_SECRET = /([?&](?:access_token|api[_-]?key|pat|sig|token)=)[^&#\s]+/gi;
const ENVIRONMENT_SECRET = /\b((?:AZURE_DEVOPS_EXT_PAT|AZURE_DEVOPS_PAT|GITHUB_TOKEN)\s*=\s*)[^\s"']+/gi;
const MARKDOWN_CODE_EDGE = /^`|`$/g;
const OPEN_STATUS = /^- Status:\s*Open\s*$/m;
const REGEX_META = /[.*+?^${}()|[\]\\]/g;
const TRAILING_SPACE = /\s*$/;

function section(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "im"))?.[1].trim() ?? "";
}

function normalizeGitHubHierarchy(issue) {
  return {
    acceptanceCriteria: section(issue.body ?? "", "Acceptance criteria"),
    body: issue.body ?? "",
    number: issue.number,
    state: issue.state,
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

function reviewThreadNodes(payload) {
  return payload.data?.repository?.pullRequest?.reviewThreads?.nodes ?? payload.reviewThreads?.nodes ?? payload.reviewThreads ?? [];
}

function normalizeGitHubReviewThreads(payload, selected = []) {
  const requested = new Set(selected.map((id) => id.toUpperCase()));
  const findings = reviewThreadNodes(payload).flatMap((thread) => {
    const comment = thread.comments?.nodes?.[0] ?? thread.comments?.[0];
    if (!comment?.databaseId) {
      return [];
    }
    const id = `GH-${comment.databaseId}`;
    let reviewState = "open";
    if (thread.isOutdated || thread.isResolved || !thread.line) {
      reviewState = "stale";
    }
    return [{
      body: comment.body ?? "",
      commentId: comment.databaseId,
      commitSha: comment.commit?.oid,
      file: thread.path,
      id,
      isOutdated: Boolean(thread.isOutdated),
      isResolved: Boolean(thread.isResolved),
      line: thread.line,
      reviewState,
      threadId: thread.id,
      url: comment.url,
    }];
  });
  let chosen = findings;
  if (requested.size > 0) {
    chosen = findings.filter((finding) => requested.has(finding.id));
  }
  const found = new Set(chosen.map((finding) => finding.id));
  const missing = [...requested].filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`Selected GitHub finding not found: ${missing.join(", ")}`);
  }
  return chosen;
}

function parseFields(block) {
  const fields = {};
  for (const match of block.matchAll(FIELD_LINE)) {
    fields[match[1].toLowerCase().replaceAll(" ", "")] = match[2];
  }
  return fields;
}

function parseAzureReport(report, selected = []) {
  const matches = [...report.matchAll(AZURE_FINDING_HEADING)];
  const requested = new Set(selected.map((id) => id.toUpperCase()));
  const findings = matches.map((match, index) => {
    const blockEnd = matches[index + 1]?.index ?? report.length;
    const fields = parseFields(report.slice(match.index + match[0].length, blockEnd));
    const location = fields.location?.replace(MARKDOWN_CODE_EDGE, "") ?? "";
    const separator = location.lastIndexOf(":");
    let file = location;
    let line;
    if (separator >= 0) {
      file = location.slice(0, separator);
      line = Number(location.slice(separator + 1));
    }
    return {
      correction: fields.correction,
      file,
      id: match[1],
      impact: fields.impact,
      line,
      problem: match[3],
      requirement: fields.requirement,
      rootCause: fields.rootcause,
      severity: match[2],
      status: fields.status,
    };
  });
  let chosen = findings;
  if (requested.size > 0) {
    chosen = findings.filter((finding) => requested.has(finding.id));
  }
  const found = new Set(chosen.map((finding) => finding.id));
  const missing = [...requested].filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`Selected Azure finding not found: ${missing.join(", ")}`);
  }
  return chosen;
}

function safeEvidence(value) {
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

function updateAzureReport(report, resolutions) {
  let updated = report;
  for (const [id, resolution] of Object.entries(resolutions)) {
    const heading = new RegExp(`(^###\\s+${id.replace(REGEX_META, "\\$&")}:.*$)([\\s\\S]*?)(?=^###\\s+ADO-|^##\\s+|(?![\\s\\S]))`, "m");
    const match = updated.match(heading);
    if (!match) {
      throw new Error(`Azure finding not found: ${id}`);
    }
    if (!OPEN_STATUS.test(match[2])) {
      throw new Error(`Azure finding is not open: ${id}`);
    }
    const details = match[2]
      .replace(OPEN_STATUS, "- Status: Fixed")
      .replace(TRAILING_SPACE, `\n- Commit: ${safeEvidence(resolution.commit)}\n- Verification: ${safeEvidence(resolution.verification)}\n\n`);
    updated = updated.replace(heading, `${match[1]}${details}`);
  }
  return updated;
}

export {
  normalizeGitHubHierarchy,
  normalizeGitHubReviewThreads,
  parseAzureReport,
  redactSecrets,
  updateAzureReport,
};
