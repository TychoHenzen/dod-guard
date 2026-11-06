// Reports every proxy hit that the plan's File lines do not name. A hit outside the File lines is code the
// planned edit can affect and the plan forgot. The plans come from step-plan-parse.mjs with the caller's
// search result on each proxy; this module is pure.
function proxyProblems(plan, proxy) {
  const { searched, hits } = proxy.result;
  const where = `step plan ${plan.task} proxy check "${proxy.pattern}" in ${proxy.scope}`;
  if (searched === 0) {
    return [`${where} searched no file`];
  }
  const outside = hits.filter((hit) => !plan.files.includes(hit));
  return outside.map((hit) => `${where} hits ${hit}, which no File line names`);
}

function planProblems(plan) {
  const problems = [...plan.errors];
  if (plan.files.length === 0) {
    problems.push(`step plan ${plan.task} has no File line`);
  }
  return [...problems, ...plan.proxies.flatMap((proxy) => proxyProblems(plan, proxy))];
}

function duplicateMessage(task) {
  return `step plan ${task} appears more than once; keep only its newest accepted comment`;
}

function duplicateProblems(plans) {
  const tasks = plans.map((plan) => plan.task);
  const repeated = new Set(tasks.filter((task, index) => tasks.indexOf(task) !== index));
  return [...repeated].map(duplicateMessage);
}

// Each proxy must carry result { searched, hits } from the caller's search.
function proxyRemainder(plans) {
  return [...duplicateProblems(plans), ...plans.flatMap(planProblems)];
}

export { proxyRemainder };
