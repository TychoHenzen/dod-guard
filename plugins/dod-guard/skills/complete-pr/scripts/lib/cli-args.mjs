// Parses the complete-pr command line into one request, or null when the usage is wrong.
const HEAD_PATTERN = /^[0-9a-f]{40}$/i;
const SWITCHES = { "--dry-run": "dryRun", "--recover-merged": "recoverMerged" };
const VALUE_FLAGS = { "--pushed-head": "pushedHead", "--repo-dir": "repoDir" };

function readFlag(options, rest) {
  const flag = rest.shift();
  if (Object.hasOwn(SWITCHES, flag)) {
    options[SWITCHES[flag]] = true;
    return true;
  }
  if (Object.hasOwn(VALUE_FLAGS, flag)) {
    options[VALUE_FLAGS[flag]] = rest.shift() ?? "";
    return true;
  }
  return false;
}

function parseFlags(flags) {
  const options = { dryRun: false, pushedHead: null, recoverMerged: false, repoDir: null };
  const rest = [...flags];
  while (rest.length > 0) {
    if (!readFlag(options, rest)) {
      return null;
    }
  }
  return options;
}

function validMode(options) {
  if (options.recoverMerged) {
    return options.pushedHead === null;
  }
  return !options.dryRun && HEAD_PATTERN.test(options.pushedHead ?? "");
}

function validTarget(repository, pullNumber) {
  return Boolean(repository) && Number.isInteger(pullNumber) && pullNumber > 0;
}

function parseArguments(argv) {
  const [repository, pullNumberText, ...flags] = argv;
  const pullNumber = Number.parseInt(pullNumberText, 10);
  const options = parseFlags(flags);
  if (!(options && validTarget(repository, pullNumber) && validMode(options) && options.repoDir !== "")) {
    return null;
  }
  return { ...options, pullNumber, repository };
}

export { parseArguments };
