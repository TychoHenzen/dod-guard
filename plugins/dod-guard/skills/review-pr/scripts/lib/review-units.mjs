const PULL_REQUEST_UNIT = "pull-request";
const MAX_UNIT_FILES = 8;
const OWNER_MARKERS = new Set(["SKILL.md", "package.json"]);
// The four shipped reviewer agents, in the order angles are listed and dispatched.
const REVIEWERS = Object.freeze(["review-pr-feature", "review-pr-design", "review-pr-reliability", "review-pr-hygiene"]);
const TEST_DIRECTORY = /(?:^|\/)(?:tests?|__tests__)\//;
const TEST_SUFFIX = /\.test\.[cm]?[jt]sx?$/;
const CODE_FILE = /\.(?:[cm]?[jt]sx?|py|rs|cs|go|ps1|sh)$/;
const CONFIG_DIRECTORY = /(?:^|\/)\.github\//;
const CONFIG_SUFFIX = /\.(?:json|ya?ml|toml)$/;

// Tests prove behavior (feature) and must stay readable; code carries design and
// failure risk; prose and config each have one concern worth a reviewer's time.
const ANGLES_BY_KIND = Object.freeze({
  test: ["review-pr-feature", "review-pr-hygiene"],
  code: ["review-pr-design", "review-pr-reliability", "review-pr-hygiene"],
  prose: ["review-pr-hygiene"],
  config: ["review-pr-reliability"],
});

function directoryOf(path) {
  const slash = path.lastIndexOf("/");
  if (slash === -1) {
    return ".";
  }
  return path.slice(0, slash);
}

function fileKind(path) {
  if (TEST_DIRECTORY.test(path) || TEST_SUFFIX.test(path)) { return "test"; }
  if (CODE_FILE.test(path)) { return "code"; }
  if (CONFIG_DIRECTORY.test(path) || CONFIG_SUFFIX.test(path)) { return "config"; }
  return "prose";
}

function ownerDirectories(allFiles) {
  const owners = new Set();
  for (const path of allFiles) {
    if (OWNER_MARKERS.has(path.slice(path.lastIndexOf("/") + 1))) { owners.add(directoryOf(path)); }
  }
  return owners;
}

function owningDirectory(path, owners) {
  for (let directory = directoryOf(path); directory !== "."; directory = directoryOf(directory)) {
    if (owners.has(directory)) { return directory; }
  }
  return directoryOf(path);
}

function anglesFor(files) {
  const angles = new Set(files.flatMap((path) => ANGLES_BY_KIND[fileKind(path)]));
  return REVIEWERS.filter((angle) => angles.has(angle));
}

function unitId(owner, part, parts) {
  if (parts === 1) {
    return owner;
  }
  return `${owner}#${part + 1}`;
}

function planReviewUnits(changedFiles, allFiles) {
  const owners = ownerDirectories(allFiles);
  const groups = new Map();
  for (const path of [...changedFiles].sort()) {
    const owner = owningDirectory(path, owners);
    groups.set(owner, [...(groups.get(owner) ?? []), path]);
  }
  const units = [];
  for (const [owner, files] of groups) {
    const parts = Math.ceil(files.length / MAX_UNIT_FILES);
    for (let part = 0; part < parts; part += 1) {
      const slice = files.slice(part * MAX_UNIT_FILES, (part + 1) * MAX_UNIT_FILES);
      units.push({ id: unitId(owner, part, parts), owner, files: slice, angles: anglesFor(slice) });
    }
  }
  return units;
}

export { MAX_UNIT_FILES, PULL_REQUEST_UNIT, REVIEWERS, fileKind, planReviewUnits };
