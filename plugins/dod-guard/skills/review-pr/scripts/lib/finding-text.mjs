// How long each part of a posted finding may be. The reviewer agents are told
// the same limits, so they write each finding short; the clip only guards a
// thread or a body line against a reviewer that ignored them.

// ASSUMPTION: one finding is a sentence of problem plus a short impact,
// correction, evidence and requirement. At these limits a thread's comment stays
// under the reviewComment cap with its reviewer names, its moved-location note
// and its GH-<id>.
const FIELD_LIMITS = Object.freeze({
  problem: 200,
  impact: 300,
  correction: 300,
  rootCause: 300,
  requirement: 200,
  evidence: 400,
});

// A path past this length is shown with its start cut, so the file name stays.
const PATH_SHOWN = 120;

function oneLine(text) {
  return String(text ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

function clip(text, limit) {
  const value = oneLine(text);
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function shownPath(path) {
  const value = String(path);
  return value.length > PATH_SHOWN ? `...${value.slice(value.length - PATH_SHOWN + 3)}` : value;
}

function field(finding, name) {
  return clip(finding[name], FIELD_LIMITS[name]);
}

export { clip, FIELD_LIMITS, field, PATH_SHOWN, shownPath };
