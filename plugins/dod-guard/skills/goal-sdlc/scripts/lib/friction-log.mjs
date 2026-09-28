const FRICTION_LOG_TITLE = /^Friction log (\d{4}-\d{2}-\d{2})$/;

function localDate(now) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// goal-sdlc appends friction to one log per day; refining it before the day
// ends would split that day's entries across a PBI and a fresh log.
function collectingFrictionLog(records, today = localDate(new Date())) {
  return records.some((record) => {
    const logDate = FRICTION_LOG_TITLE.exec(record.issue?.title ?? "")?.[1];
    return logDate !== undefined && logDate >= today;
  });
}

export { collectingFrictionLog, localDate };
