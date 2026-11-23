// Reads the File, Proxy check and Commit lines of step plan comments into plain records. A proxy check
// searches for code the planned edit can affect; the search and the report belong to other modules, so
// this one is pure. It also records a shell command that commits, stages or pushes, because the worker
// that runs a plan never commits: the thread that dispatched it commits under the Commit line.
const PLAN_HEADING = /^## Step plan: (\S+)\s*$/u;
const FILE_LINE = /^\s*File:\s*(\S+)/u;
const PROXY_LINE = /^\s*Proxy check:\s*(.+?)\s+in\s+(\S+)\s*$/u;
const PROXY_PREFIX = /^\s*Proxy check:/u;
const COMMIT_LINE = /^\s*Commit:\s*(.*?)\s*$/u;
const FENCE = /^\s*```\s*([\w+-]*)/u;
// An untagged fence counts as shell: plans often leave the tag off their validation commands.
const SHELL_TAGS = new Set(["", "bash", "sh", "shell", "zsh", "console", "powershell", "pwsh", "ps1", "cmd", "bat"]);
// git in command position: at the line start, after a prompt, or after a separator such as && or |.
// Text that only names git, such as an echo argument or an assertion, is not a run.
const GIT_WRITE = /(?:^|&&|\|\||[;|(])\s*(?:\$\s+)?git(?:\s+-C\s+\S+)*\s+(add|commit|push)\b/u;
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

// An empty Commit line leaves commit "", which the proof reports as a missing one.
function setCommit(plan, message) {
  if (plan.commit !== "" && message !== "") {
    plan.errors.push(`step plan ${plan.task} has more than one Commit line`);
  } else if (message !== "") {
    plan.commit = message;
  }
}

function checkFencedCommand(plan, line) {
  const write = GIT_WRITE.exec(line);
  if (write) {
    plan.errors.push(
      `step plan ${plan.task} runs git ${write[1]}; the worker never commits, so drop the step ` +
        `and put the message on the plan's Commit line: ${line.trim()}`,
    );
  }
}

// fence is null outside a fenced block, else { shell } for the block the line sits in.
function readLine(plan, line, fence) {
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
    return;
  }
  const commit = fence === null ? COMMIT_LINE.exec(line) : null;
  if (commit) {
    setCommit(plan, commit[1]);
    return;
  }
  if (fence?.shell) {
    checkFencedCommand(plan, line);
  }
}

function readInto(parse, line) {
  const heading = PLAN_HEADING.exec(line);
  if (heading) {
    parse.plans.push({ task: heading[1], files: [], proxies: [], commit: "", errors: [] });
    parse.fence = null;
    return;
  }
  const fence = FENCE.exec(line);
  if (fence) {
    parse.fence = parse.fence === null ? { shell: SHELL_TAGS.has(fence[1].toLowerCase()) } : null;
    return;
  }
  if (parse.plans.length > 0) {
    readLine(parse.plans.at(-1), line, parse.fence);
  }
}

// One entry per `## Step plan: <task-id>` heading, in text order.
function parseStepPlans(text) {
  const parse = { plans: [], fence: null };
  for (const line of String(text).split(LINE_BREAK)) {
    readInto(parse, line);
  }
  return parse.plans;
}

export { parseStepPlans };
