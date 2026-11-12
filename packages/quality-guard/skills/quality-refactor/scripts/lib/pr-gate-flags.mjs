// Command-line flags of the pull-request gate.
import { severityRank } from "./pr-gate-compare.mjs";

export function isSeverity(value) {
  try {
    return severityRank(value) > 0;
  } catch {
    return false;
  }
}

function setRuleBlockOn(options, value) {
  const [rule, severity, ...rest] = value.split(":");
  if (!rule || rest.length > 0 || !isSeverity(severity)) {
    options.error = "--rule-block-on must look like <rule>:<low|medium|high>";
    return;
  }
  options.ruleBlockOn[rule] = severity;
}

const text = (key) => (options, value) => {
  options[key] = value;
};

const count = (flag, key) => (options, value) => {
  if (!/^\d+$/.test(value)) {
    options.error = `${flag}<n> needs a whole number`;
    return;
  }
  options[key] = Number(value);
};

export const FLAGS = {
  "--base=": text("base"),
  "--root=": (options) => {
    options.error =
      "--root was removed: the gate scans the whole checkout. " +
      "List code that is not yours under excludePaths in .quality-guard.json";
  },
  "--exclude=": (options, value) => options.excludes.push(value),
  "--block-on=": text("blockOn"),
  "--rule-block-on=": setRuleBlockOn,
  "--fix-medium-high=": count("--fix-medium-high=", "fixMediumHigh"),
  "--fix-low=": count("--fix-low=", "fixLow"),
  "--report=": text("report"),
  "--comment=": text("comment"),
  "--report-link=": text("reportLink"),
};
