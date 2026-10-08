// Expected `.finding` rows for the live quality dashboard test. They mirror the
// row shape render-quality.mjs produces, so the test compares the DOM with the
// saved report instead of with the code under test.

function ruleName(finding) {
  return finding.rule ?? finding.kind ?? "finding";
}

function messageText(finding) {
  return finding.message ?? finding.reason ?? "";
}

export function fileRow(finding) {
  let location = "";
  if (finding.line) {
    location = `:${finding.line}`;
  }
  return { rule: ruleName(finding), location, message: messageText(finding), severity: finding.severity };
}

export function projectRow(finding) {
  let location = finding.file;
  if (finding.line) {
    location = `${finding.file}:${finding.line}`;
  }
  return { rule: ruleName(finding), location, message: messageText(finding), severity: finding.severity };
}
