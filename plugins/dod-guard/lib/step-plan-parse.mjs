// Reads the File and Proxy check lines of step plan comments into plain records. A proxy check searches
// for code the planned edit can affect; the search and the report belong to other modules, so this one is pure.
const PLAN_HEADING = /^## Step plan: (\S+)\s*$/u;
const FILE_LINE = /^\s*File:\s*(\S+)/u;
const PROXY_LINE = /^\s*Proxy check:\s*(.+?)\s+in\s+(\S+)\s*$/u;
const PROXY_PREFIX = /^\s*Proxy check:/u;
const LINE_BREAK = /\r?\n/u;
const LEADING_DOT_SLASH = /^\.\//u;

function normalize(file) {
  return file.replaceAll("\\", "/").replace(LEADING_DOT_SLASH, "");
}

function isValidRegex(pattern) {
  try {
    return new RegExp(pattern, "mu") instanceof RegExp;
  } catch {
    return false;
  }
}

function addProxy(plan, match) {
  const [, pattern, scope] = match;
  if (!isValidRegex(pattern)) {
    plan.errors.push(`step plan ${plan.task} proxy check pattern is not a valid regular expression: ${pattern}`);
    return;
  }
  plan.proxies.push({ pattern, scope: normalize(scope) });
}

function readLine(plan, line) {
  const file = FILE_LINE.exec(line);
  if (file) {
    plan.files.push(normalize(file[1]));
    return;
  }
  const proxy = PROXY_LINE.exec(line);
  if (proxy) {
    addProxy(plan, proxy);
    return;
  }
  if (PROXY_PREFIX.test(line)) {
    plan.errors.push(`step plan ${plan.task} has a malformed proxy check line: ${line.trim()}`);
  }
}

function readInto(plans, line) {
  const heading = PLAN_HEADING.exec(line);
  if (heading) {
    plans.push({ task: heading[1], files: [], proxies: [], errors: [] });
    return;
  }
  if (plans.length > 0) {
    readLine(plans.at(-1), line);
  }
}

// One entry per `## Step plan: <task-id>` heading, in text order.
function parseStepPlans(text) {
  const plans = [];
  for (const line of String(text).split(LINE_BREAK)) {
    readInto(plans, line);
  }
  return plans;
}

export { parseStepPlans };
