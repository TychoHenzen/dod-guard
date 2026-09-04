const pathCompare = (left, right) => left.path.localeCompare(right.path);
const PATH_SEPARATOR = /[/\\]+/;

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
  return {
    ...file,
    findings,
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity !== "error").length,
  };
}

function compareFiles(sort) {
  if (sort === "score") {
    return (left, right) => left.score - right.score || pathCompare(left, right);
  }
  if (sort === "errors") {
    return (left, right) => right.errors - left.errors || pathCompare(left, right);
  }
  if (sort === "warnings") {
    return (left, right) => right.warnings - left.warnings || pathCompare(left, right);
  }
  return pathCompare;
}

function summarize(files) {
  const fileCount = files.length;
  const errors = files.reduce((total, file) => total + file.errors, 0);
  const warnings = files.reduce((total, file) => total + file.warnings, 0);
  let averageScore = null;
  if (fileCount > 0) {
    averageScore = files.reduce((total, file) => total + Number(file.score ?? 0), 0) / fileCount;
  }
  return { fileCount, errors, warnings, averageScore };
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
  if (sort === "errors") {
    return (left, right) => right.summary.errors - left.summary.errors || pathCompare(left, right);
  }
  if (sort === "warnings") {
    return (left, right) => right.summary.warnings - left.summary.warnings || pathCompare(left, right);
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

function buildQualityView(report, options = {}) {
  const controls = {
    text: options.text ?? "",
    severity: options.severity ?? "all",
    rule: options.rule ?? "all",
    sort: options.sort ?? "path",
    expanded: options.expanded ?? true,
    folderState: options.folderState,
  };
  const rules = [...new Set(report.files.flatMap((file) => (file.findings ?? []).map(findingRule)))].sort();
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
  return {
    controls,
    rules,
    files,
    tree,
    summary: summarize(files),
    emptyState: emptyState(report, files),
  };
}

export { buildQualityView };
