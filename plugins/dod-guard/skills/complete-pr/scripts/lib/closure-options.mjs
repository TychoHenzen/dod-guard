// Option parsing shared by the closure.mjs subcommands. A parser answers false
// for a value the caller must report as a usage error.

function given(value) {
  return typeof value === "string" && value !== "true" && value.length > 0;
}

function isIssueNumber(number) {
  return Number.isInteger(number) && number > 0;
}

// --children=<n,...> lists the issues a completion record also covers. A typo must stop
// before the first write, so one entry that is not a positive integer makes the whole
// list false, and the record command reports that as a usage error.
function childList(value) {
  if (value === undefined || value === "") return [];
  if (!given(value)) return false;
  const numbers = value.split(",").map((entry) => Number(entry.trim()));
  return numbers.every(isIssueNumber) && numbers;
}

// --hierarchy=<issue> is the refinement request to close that issue as a pure
// hierarchy record; false marks a value that is not an issue number.
function hierarchyOption(value) {
  if (value === undefined) return null;
  const number = Number(value);
  return isIssueNumber(number) ? number : false;
}

function snapshotOptions(args) {
  const hierarchy = hierarchyOption(args.hierarchy);
  return given(args.snapshot) && hierarchy !== false && { hierarchy };
}

export { childList, given, snapshotOptions };
