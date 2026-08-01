// Churn is the loop's best signal for accidental complexity. Only one kind of
// churn counts. Six commits in a row to one file are one piece of work being
// built, and building is not churn. Three commits a dozen commits apart are a
// file that keeps pulling people back. That is what accidental complexity does.
//
// So this groups the commits that touched a file into work sessions. It counts
// the returns: how many times the work left the file and came back. A return
// that carried a fix weighs heaviest. A repair somebody had to come back for is
// the clearest evidence that the earlier shape was wrong.

// A NUL starts each commit, which keeps a subject line that looks like a path
// from being counted as one. The commit time comes first, then the subject.
export const LOG_ARGS = ["log", "--name-only", "--format=%x00%ct %s"];

// Either separation ends a session. Other commits landing in between mean the
// author moved to different work. The calendar gap catches the same move in a
// quiet repository, where months can pass with few commits in between.
const SESSION_GAP_COMMITS = 5;
const SESSION_GAP_SECONDS = 14 * 24 * 60 * 60;

const FIX_SUBJECT = /^(fix|hotfix|bugfix|patch|revert)\b/i;

function parseCommit(block) {
  const [header, ...rest] = block.split("\n");
  const split = header.indexOf(" ");
  const time = Number(split < 0 ? header : header.slice(0, split));
  const subject = split < 0 ? "" : header.slice(split + 1);
  const paths = rest.map((line) => line.trim()).filter((line) => line !== "");
  return { time, fix: FIX_SUBJECT.test(subject.trim()), paths };
}

// git log runs newest first. Reversing puts the visits in the order they
// happened, so the first session of a file is the one that introduced it.
function parseCommits(logText) {
  return logText
    .split("\0")
    .filter((block) => block.trim() !== "")
    .map(parseCommit)
    .reverse();
}

function collectVisits(commits) {
  const visits = {};
  commits.forEach((commit, index) => {
    for (const path of commit.paths) {
      visits[path] ??= [];
      visits[path].push({ index, time: commit.time, fix: commit.fix });
    }
  });
  return visits;
}

function startsNewSession(previous, visit) {
  const commitGap = visit.index - previous.index;
  const timeGap = visit.time - previous.time;
  return commitGap >= SESSION_GAP_COMMITS || timeGap >= SESSION_GAP_SECONDS;
}

function toSessions(visits) {
  const sessions = [];
  for (const visit of visits) {
    const current = sessions.at(-1);
    if (current && !startsNewSession(current.last, visit)) {
      current.last = visit;
      current.fix ||= visit.fix;
      continue;
    }
    sessions.push({ last: visit, fix: visit.fix });
  }
  return sessions;
}

// Returns { [path]: { returns, fixReturns } } from `git log` output built with
// LOG_ARGS. A file worked on once, however many commits that took, has zero
// returns and scores as quiet.
export function parseChurn(logText) {
  const churn = {};
  const visitsByPath = collectVisits(parseCommits(logText));
  for (const [path, visits] of Object.entries(visitsByPath)) {
    const sessions = toSessions(visits);
    churn[path] = {
      returns: sessions.length - 1,
      fixReturns: sessions.slice(1).filter((session) => session.fix).length,
    };
  }
  return churn;
}
