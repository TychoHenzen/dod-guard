const pathCompare = (left, right) => left.path.localeCompare(right.path);
const PATH_SEPARATOR = /[/\\]+/;
const SEVERITIES = ["high", "medium", "low"];

function severityCounts(findings) {
  return Object.fromEntries(SEVERITIES.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length]));
}

function findingRule(finding) {
  return finding.rule ?? finding.kind ?? "finding";
}

function findingMatches(finding, needle) {
  return `${findingRule(finding)} ${finding.message ?? finding.reason ?? ""}`.toLowerCase().includes(needle);
}

function filterFile(file, controls) {
  const needle = controls.text.trim().toLowerCase();
  const pathMatches = needle.length > 0 && file.path.toLowerCase().includes(needle);
  const findingFilterActive = controls.severity !== "all" || controls.rule !== "all";
  let findings = file.findings ?? [];
  if (controls.severity !== "all") {
    findings = findings.filter((finding) => finding.severity === controls.severity);
  }
  if (controls.rule !== "all") {
    findings = findings.filter((finding) => findingRule(finding) === controls.rule);
  }
  if (needle && !pathMatches) {
    findings = findings.filter((finding) => findingMatches(finding, needle));
  }

  let visible = !findingFilterActive || findings.length > 0;
  if (needle) {
    visible = (pathMatches && !findingFilterActive) || findings.length > 0;
  }
  if (!visible) {
    return null;
  }
  return { ...file, findings, ...severityCounts(findings) };
}

function matchesProjectFinding(finding, controls, needle) {
  if (controls.severity !== "all" && finding.severity !== controls.severity) return false;
  if (controls.rule !== "all" && findingRule(finding) !== controls.rule) return false;
  if (!needle) return true;
  return String(finding.file ?? "").toLowerCase().includes(needle) || findingMatches(finding, needle);
}

function filterProjectFindings(report, controls) {
  const needle = controls.text.trim().toLowerCase();
  return (report.projectFindings ?? []).filter((finding) => matchesProjectFinding(finding, controls, needle));
}

function compareFiles(sort) {
  if (sort === "score") {
    return (left, right) => left.score - right.score || pathCompare(left, right);
  }
  if (SEVERITIES.includes(sort)) {
    return (left, right) => right[sort] - left[sort] || pathCompare(left, right);
  }
  return pathCompare;
}

function summarize(files) {
  const fileCount = files.length;
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, files.reduce((total, file) => total + file[severity], 0)]));
  let averageScore = null;
  if (fileCount > 0) {
    averageScore = files.reduce((total, file) => total + Number(file.score ?? 0), 0) / fileCount;
  }
  return { fileCount, ...counts, averageScore };
}

function folderNode(name, path, controls) {
  return {
    kind: "folder",
    name,
    path,
    open: controls.folderState?.get(path) ?? controls.expanded,
    children: [],
  };
}

function insertFile(tree, file, controls) {
  const parts = file.path.split(PATH_SEPARATOR);
  const name = parts.pop();
  let children = tree;
  let currentPath = "";
  for (const part of parts) {
    if (currentPath) {
      currentPath = `${currentPath}/${part}`;
    } else {
      currentPath = part;
    }
    let folder = children.find((node) => node.kind === "folder" && node.name === part);
    if (!folder) {
      folder = folderNode(part, currentPath, controls);
      children.push(folder);
    }
    children = folder.children;
  }
  children.push({ ...file, kind: "file", name, path: file.path, summary: summarize([file]) });
}

function collectFiles(children, files) {
  for (const child of children) {
    if (child.kind === "file") {
      files.push(child);
    } else {
      collectFiles(child.children, files);
    }
  }
}

function summarizeTree(nodes) {
  for (const node of nodes) {
    if (node.kind === "folder") {
      summarizeTree(node.children);
      const files = [];
      collectFiles(node.children, files);
      node.summary = summarize(files);
    }
  }
}

function compareNodes(sort) {
  if (sort === "score") {
    return (left, right) => left.summary.averageScore - right.summary.averageScore || pathCompare(left, right);
  }
  if (SEVERITIES.includes(sort)) {
    return (left, right) => right.summary[sort] - left.summary[sort] || pathCompare(left, right);
  }
  return pathCompare;
}

function sortTree(nodes, sort) {
  for (const node of nodes) {
    if (node.kind === "folder") {
      sortTree(node.children, sort);
    }
  }
  nodes.sort(compareNodes(sort));
}

function emptyState(report, files) {
  if (files.length > 0) {
    return null;
  }
  if (report.files.length > 0) {
    return "No files match the active filters.";
  }
  return "No files in this report.";
}

function reportRules(report) {
  const findings = [...report.files.flatMap((file) => file.findings ?? []), ...(report.projectFindings ?? [])];
  return [...new Set(findings.map(findingRule))].sort();
}

function withProjectCounts(fileSummary, projectFindings) {
  const counts = severityCounts(projectFindings);
  return {
    ...fileSummary,
    high: fileSummary.high + counts.high,
    medium: fileSummary.medium + counts.medium,
    low: fileSummary.low + counts.low,
  };
}

const VIEW_DEFAULTS = { text: "", severity: "all", rule: "all", sort: "path", expanded: true };

function viewControls(options) {
  const controls = { ...VIEW_DEFAULTS, folderState: options.folderState };
  for (const [name, fallback] of Object.entries(VIEW_DEFAULTS)) {
    controls[name] = options[name] ?? fallback;
  }
  return controls;
}

function buildQualityView(report, options = {}) {
  const controls = viewControls(options);
  const rules = reportRules(report);
  const files = [];
  for (const file of report.files) {
    const filtered = filterFile(file, controls);
    if (filtered) {
      files.push(filtered);
    }
  }
  files.sort(compareFiles(controls.sort));
  const tree = [];
  for (const file of files) {
    insertFile(tree, file, controls);
  }
  summarizeTree(tree);
  sortTree(tree, controls.sort);
  const projectFindings = filterProjectFindings(report, controls);
  return {
    controls,
    rules,
    files,
    tree,
    projectFindings,
    summary: withProjectCounts(summarize(files), projectFindings),
    emptyState: emptyState(report, files),
  };
}

export { buildQualityView };
