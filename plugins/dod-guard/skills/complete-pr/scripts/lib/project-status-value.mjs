// REST spells a Status name as a bare string, as {name: "..."}, or as {name: {raw, html}}, and the
// spellings must agree or the value says two things at once. An absent value is no name and gives
// null. A blank, contradictory, or unrecognized value throws, so no caller reads a name it cannot
// verify.
const NAME_SPELLINGS = ["raw", "html"];

// statusValueReason lets a caller map each rejection to its own stop text without matching the
// message.
function statusValueError(reason, message) {
  return Object.assign(new Error(message), { statusValueReason: reason });
}

function nameSpellings(name) {
  if (typeof name === "string") {
    return [name];
  }
  if (name === null || typeof name !== "object") {
    return [];
  }
  return NAME_SPELLINGS.filter((key) => key in name).map((key) => name[key]);
}

function valueSpellings(value) {
  if (typeof value === "string") {
    return [value];
  }
  return nameSpellings(value.name);
}

const REJECTION_MESSAGES = {
  "not-a-name": "Status value is not a name.",
  blank: "Status value has a blank name.",
  disagree: "Status value names disagree.",
};

function isBlankSpelling(name) {
  return typeof name !== "string" || name.trim().length === 0;
}

function rejectionReason(spellings) {
  if (spellings.length === 0) {
    return "not-a-name";
  }
  if (spellings.some(isBlankSpelling)) {
    return "blank";
  }
  if (new Set(spellings).size !== 1) {
    return "disagree";
  }
  return null;
}

export function statusValueName(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const spellings = valueSpellings(value);
  const reason = rejectionReason(spellings);
  if (reason !== null) {
    throw statusValueError(reason, REJECTION_MESSAGES[reason]);
  }
  return spellings[0];
}
